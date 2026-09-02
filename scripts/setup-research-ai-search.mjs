#!/usr/bin/env node
/**
 * Creates the optional, triggered Delta Sync AI Search index for Research.
 * Run after `node scripts/load-campus-dataset.mjs`.
 */
import nextEnv from "@next/env";

// Scripts run outside Next.js, so load the same local server-only variables
// Next would load before reading the Databricks configuration.
const { loadEnvConfig } = nextEnv;
loadEnvConfig(process.cwd());

const host = (process.env.DATABRICKS_HOST ?? "").replace(/\/$/, "");
const token = process.env.DATABRICKS_TOKEN ?? "";
const catalog = process.env.DATABRICKS_CATALOG ?? "";
const schema = process.env.DATABRICKS_SCHEMA ?? "";
const endpoint = process.env.DATABRICKS_AI_SEARCH_ENDPOINT ?? "campusquest-research-search";
const index = process.env.DATABRICKS_RESEARCH_SEARCH_INDEX ?? `${catalog}.${schema}.research_search_index`;
const sourceTable = `${catalog}.${schema}.research_search_documents`;

for (const [name, value] of Object.entries({ DATABRICKS_HOST: host, DATABRICKS_TOKEN: token, DATABRICKS_CATALOG: catalog, DATABRICKS_SCHEMA: schema })) {
  if (!value) throw new Error(`Missing ${name}`);
}

async function api(path, init = {}) {
  const response = await fetch(`${host}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) throw new Error(`${path} failed (${response.status}): ${body.message ?? body.error_code ?? "unknown error"}`);
  return { response, body };
}

async function get(path) {
  const response = await fetch(`${host}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${path} failed (${response.status}): ${body.message ?? body.error_code ?? "unknown error"}`);
  return body;
}

async function waitUntil(label, check) {
  for (let attempt = 0; attempt < 90; attempt += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
  throw new Error(`${label} did not become ready in time`);
}

const endpointPath = `/api/2.0/vector-search/endpoints/${encodeURIComponent(endpoint)}`;
if (!(await get(endpointPath))) {
  console.log(`Creating AI Search endpoint ${endpoint}`);
  await api("/api/2.0/vector-search/endpoints", { method: "POST", body: JSON.stringify({ name: endpoint, endpoint_type: "STANDARD" }) });
}
await waitUntil("AI Search endpoint", async () => {
  const value = await get(endpointPath);
  return value?.endpoint_status?.state === "ONLINE" || value?.status?.state === "ONLINE";
});

const indexPath = `/api/2.0/vector-search/indexes/${encodeURIComponent(index)}`;
if (!(await get(indexPath))) {
  console.log(`Creating Delta Sync hybrid index ${index}`);
  await api("/api/2.0/vector-search/indexes", {
    method: "POST",
    body: JSON.stringify({
      name: index,
      endpoint_name: endpoint,
      primary_key: "project_id",
      index_type: "DELTA_SYNC",
      index_subtype: "HYBRID",
      delta_sync_index_spec: {
        source_table: sourceTable,
        pipeline_type: "TRIGGERED",
        embedding_source_columns: [{ name: "search_text", embedding_model_endpoint_name: "databricks-qwen3-embedding-0-6b" }],
        columns_to_sync: ["project_id", "research_area", "department", "status", "open_positions", "accepting_students", "skill_slugs"],
      },
    }),
  });
}

// A freshly-created Delta Sync index exists before its endpoint is usable.
// Syncing during PROVISIONING_ENDPOINT returns 400, so wait for this initial
// readiness transition before asking the triggered pipeline to refresh.
await waitUntil("research search index provisioning", async () => {
  const value = await get(indexPath);
  return value?.status?.ready === true;
});
console.log("Synchronizing research search index");
await api(`${indexPath}/sync`, { method: "POST", body: "{}" });
await new Promise((resolve) => setTimeout(resolve, 1_000));
await waitUntil("research search index", async () => {
  const value = await get(indexPath);
  return value?.status?.ready === true;
});
console.log(`AI Search ready: ${index}`);
