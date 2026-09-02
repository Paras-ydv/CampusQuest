#!/usr/bin/env node
/**
 * Deploys databricks/dashboards/placement_insights.lvdash.json as an AI/BI
 * dashboard, and publishes it so it can be embedded.
 *
 *   node scripts/deploy-placement-dashboard.mjs            # import + publish
 *   node scripts/deploy-placement-dashboard.mjs --export   # pull the workspace copy back
 *
 * Deployment goes through the Workspace import API rather than
 * lakeview/create. Both can produce a dashboard, but import is idempotent on a
 * fixed path — re-running it updates the same object instead of creating a
 * second "Placement insights" every time, and it is the same call the
 * Databricks CLI makes for a `.lvdash.json` in a bundle.
 *
 * Two parameters make the import land as a dashboard rather than as a plain
 * file: `format: "AUTO"`, and a path that keeps the full `.lvdash.json` double
 * extension. Drop either and the call still returns 200 — you just get a text
 * file in the workspace and no dashboard.
 *
 * `--export` is the other half of the round trip. The widget layout schema is
 * not publicly specified, so the practical workflow is to adjust panels in the
 * AI/BI editor and export them back here, keeping the repo as the source of
 * truth.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(root, "databricks/dashboards/placement_insights.lvdash.json");
const WORKSPACE_PATH = "/Workspace/Shared/campusquest/dashboards/placement_insights.lvdash.json";
const DISPLAY_NAME = "CampusQuest — Placement insights";

const HOST = (process.env.DATABRICKS_HOST ?? "").replace(/\/$/, "");
const TOKEN = process.env.DATABRICKS_TOKEN ?? "";
const WAREHOUSE = process.env.DATABRICKS_SQL_WAREHOUSE_ID ?? "";
const CATALOG = process.env.DATABRICKS_CATALOG ?? "";
const SCHEMA = process.env.DATABRICKS_SCHEMA ?? "";

for (const [name, value] of Object.entries({
  DATABRICKS_HOST: HOST, DATABRICKS_TOKEN: TOKEN,
  DATABRICKS_SQL_WAREHOUSE_ID: WAREHOUSE, DATABRICKS_CATALOG: CATALOG, DATABRICKS_SCHEMA: SCHEMA,
})) {
  if (!value) { console.error(`Missing ${name}`); process.exit(1); }
}

async function api(path, init) {
  const response = await fetch(`${HOST}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${body.message ?? ""}`);
  return body;
}

/** The committed artefact is catalogue-agnostic, exactly like the DDL files. */
function resolved(text) {
  return text.replace(/\{\{catalog\}\}/g, CATALOG).replace(/\{\{schema\}\}/g, SCHEMA);
}

async function dashboardId() {
  const status = await api(`/api/2.0/workspace/get-status?path=${encodeURIComponent(WORKSPACE_PATH)}`);
  if (status.object_type !== "DASHBOARD") {
    throw new Error(`${WORKSPACE_PATH} imported as ${status.object_type}, not DASHBOARD — check format and the .lvdash.json extension`);
  }
  // `resource_id` is the workspace *object* id, not the Lakeview dashboard id.
  // Most of the lakeview endpoints accept either, which is what makes this easy
  // to miss — but `GET /published` rejects it as a "tree ID", and the embed SDK
  // needs the real one. Resolve it rather than printing a value that fails only
  // in the browser.
  const dashboard = await api(`/api/2.0/lakeview/dashboards/${status.resource_id}`);
  return dashboard.dashboard_id;
}

if (process.argv.includes("--export")) {
  const id = await dashboardId();
  const dashboard = await api(`/api/2.0/lakeview/dashboards/${id}`);
  // Re-template so an export never hard-codes one workspace's catalogue.
  const templated = dashboard.serialized_dashboard
    .split(`${CATALOG}.${SCHEMA}.`).join("{{catalog}}.{{schema}}.");
  writeFileSync(SOURCE, `${JSON.stringify(JSON.parse(templated), null, 2)}\n`);
  console.log(`exported ${id} → databricks/dashboards/placement_insights.lvdash.json`);
  process.exit(0);
}

const serialized = resolved(readFileSync(SOURCE, "utf8"));
JSON.parse(serialized); // Fail here rather than on a 200 that produces a blank dashboard.

await api("/api/2.0/workspace/mkdirs", {
  method: "POST",
  body: JSON.stringify({ path: WORKSPACE_PATH.slice(0, WORKSPACE_PATH.lastIndexOf("/")) }),
});

await api("/api/2.0/workspace/import", {
  method: "POST",
  body: JSON.stringify({
    path: WORKSPACE_PATH,
    format: "AUTO",
    overwrite: true,
    content: Buffer.from(serialized, "utf8").toString("base64"),
  }),
});
console.log(`imported ${WORKSPACE_PATH}`);

const id = await dashboardId();

// The imported draft carries no warehouse and takes its name from the file.
await api(`/api/2.0/lakeview/dashboards/${id}`, {
  method: "PATCH",
  body: JSON.stringify({ display_name: DISPLAY_NAME, warehouse_id: WAREHOUSE }),
});

// `embed_credentials: false` is deliberate. With credentials embedded, every
// query runs as whoever last published and the service principal's grants stop
// meaning anything — which is the whole basis of the token scoping the app
// relies on. Left false, the embedded dashboard runs as the service principal.
await api(`/api/2.0/lakeview/dashboards/${id}/published`, {
  method: "POST",
  body: JSON.stringify({ embed_credentials: false, warehouse_id: WAREHOUSE }),
});

console.log(`published ${DISPLAY_NAME}`);
console.log(`\nDATABRICKS_DASHBOARD_ID=${id}`);
