#!/usr/bin/env node
/**
 * Deploys the analytical plane to Databricks and, optionally, creates the
 * CampusQuest Genie Agent over it.
 *
 * Everything runs through the SQL Statement Execution API against a serverless
 * warehouse, so no cluster and no Faker install are needed:
 *
 *   node scripts/databricks-deploy.mjs            # DDL + seed
 *   node scripts/databricks-deploy.mjs --genie    # ... and create the Agent
 *
 * Reads DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_SQL_WAREHOUSE_ID,
 * DATABRICKS_CATALOG and DATABRICKS_SCHEMA from the environment.
 */
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

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
  if (!response.ok) throw new Error(`${path} → ${response.status}: ${body.message ?? JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/**
 * Statements are executed one at a time and awaited. The temporary views the
 * seed defines live for the duration of a session, so every statement is sent
 * on the same session by keeping them sequential on one warehouse.
 */
async function runSql(statement) {
  let result = await api("/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({ warehouse_id: WAREHOUSE, statement, wait_timeout: "50s" }),
  });
  // A statement that outruns wait_timeout continues asynchronously.
  while (["PENDING", "RUNNING"].includes(result.status?.state)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    result = await api(`/api/2.0/sql/statements/${result.statement_id}`);
  }
  if (result.status?.state !== "SUCCEEDED") {
    throw new Error(result.status?.error?.message ?? `statement ${result.status?.state}`);
  }
  return result;
}

/** Splits on semicolons that end a statement, ignoring those inside strings. */
function statementsIn(sql) {
  return sql
    .replace(/\{\{catalog\}\}/g, CATALOG)
    .replace(/\{\{schema\}\}/g, SCHEMA)
    .split(/;\s*$/m)
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

async function runFile(relativePath) {
  const sql = readFileSync(join(root, relativePath), "utf8");
  const statements = statementsIn(sql);
  console.log(`\n${relativePath} — ${statements.length} statements`);
  for (const [index, statement] of statements.entries()) {
    const label = statement.split("\n")[0].slice(0, 68);
    process.stdout.write(`  [${index + 1}/${statements.length}] ${label} … `);
    await runSql(statement);
    console.log("ok");
  }
}

/** The tables the Agent is allowed to see. Genie answers only over these. */
const GENIE_TABLES = [
  "job_postings", "job_required_skills", "job_preferred_skills", "companies",
  "placement_outcomes", "learning_resources", "skill_graph",
  "students_analytical", "role_alignment", "skill_gap_view",
];

const SAMPLE_QUESTIONS = [
  "What should I learn next for my goal role?",
  "Which skills do AI/ML Engineer postings require most often?",
  "How has demand for Docker changed since 2022?",
  "Which open learning resources close the largest skill gaps?",
];

/** The API generates ids server-side for existing spaces; new ones need our own. */
const newId = () => randomBytes(16).toString("hex");

/**
 * `serialized_space` is the Agent's whole definition — data sources,
 * instructions and sample questions — passed as a JSON *string*. The shape is
 * version 2, matching what GET ?include_serialized_space=true returns.
 */
function serializedSpace() {
  const instructions = readFileSync(join(root, "databricks/genie/instructions.md"), "utf8");
  const examples = readFileSync(join(root, "databricks/genie/example_queries.sql"), "utf8")
    .replace(/\{\{catalog\}\}/g, CATALOG)
    .replace(/\{\{schema\}\}/g, SCHEMA)
    .split(/\n(?=-- Question:)/)
    .map((block) => {
      const question = block.match(/^-- Question:\s*(.+)$/m)?.[1];
      const sql = block.replace(/^--.*$/gm, "").trim();
      return question && sql ? { id: newId(), question: [question], sql: [sql] } : null;
    })
    .filter(Boolean)
    // Same rule as tables: every keyed list must arrive sorted by id.
    .sort((a, b) => a.id.localeCompare(b.id));

  return JSON.stringify({
    version: 2,
    config: {
      sample_questions: SAMPLE_QUESTIONS.map((question) => ({ id: newId(), question: [question] }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    },
    data_sources: {
      // The API rejects an unsorted list outright.
      tables: GENIE_TABLES.map((table) => `${CATALOG}.${SCHEMA}.${table}`)
        .sort()
        .map((identifier) => ({ identifier })),
    },
    instructions: {
      text_instructions: [{ id: newId(), content: [instructions] }],
      example_question_sqls: examples,
    },
  });
}

async function createGenieSpace() {
  const space = await api("/api/2.0/genie/spaces", {
    method: "POST",
    body: JSON.stringify({
      title: "CampusQuest",
      description: "Campus career analytics: historical role alignment, skill gaps, placements and learning resources.",
      warehouse_id: WAREHOUSE,
      serialized_space: serializedSpace(),
    }),
  });
  console.log(`\nGenie Agent created — add this to .env:\n  DATABRICKS_GENIE_SPACE_ID=${space.space_id}`);
  return space.space_id;
}

await runFile("databricks/ddl/001_analytical_plane.sql");
await runFile("databricks/seed/00_seed_analytical.sql");

const counts = await runSql(
  `SELECT 'job_postings' t, COUNT(*) n FROM ${CATALOG}.${SCHEMA}.job_postings
   UNION ALL SELECT 'job_required_skills', COUNT(*) FROM ${CATALOG}.${SCHEMA}.job_required_skills
   UNION ALL SELECT 'students_analytical', COUNT(*) FROM ${CATALOG}.${SCHEMA}.students_analytical
   UNION ALL SELECT 'role_alignment', COUNT(*) FROM ${CATALOG}.${SCHEMA}.role_alignment
   UNION ALL SELECT 'skill_gap_view', COUNT(*) FROM ${CATALOG}.${SCHEMA}.skill_gap_view`,
);
console.log("\nRow counts:");
for (const [table, n] of counts.result?.data_array ?? []) console.log(`  ${table.padEnd(22)} ${n}`);

if (process.argv.includes("--genie")) await createGenieSpace();
