#!/usr/bin/env node
/**
 * Applies the fourteen-table DDL, loads databricks/seed/data/*.csv into it, and
 * creates the alignment views.
 *
 *   node scripts/load-campus-dataset.mjs
 *
 * Everything goes through the SQL Statement Execution API against a serverless
 * warehouse: no cluster, no notebook, no DBFS upload. Rows are sent as batched
 * INSERT ... VALUES, which is fine at this volume (~3.5k rows).
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = join(root, "databricks/seed/data");

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

async function runSql(statement) {
  let result = await api("/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({ warehouse_id: WAREHOUSE, statement, wait_timeout: "50s" }),
  });
  while (["PENDING", "RUNNING"].includes(result.status?.state)) {
    await new Promise((r) => setTimeout(r, 2000));
    result = await api(`/api/2.0/sql/statements/${result.statement_id}`);
  }
  if (result.status?.state !== "SUCCEEDED") {
    throw new Error(result.status?.error?.message ?? `statement ${result.status?.state}`);
  }
  return result;
}

function statementsIn(sql) {
  return sql
    .replace(/\{\{catalog\}\}/g, CATALOG)
    .replace(/\{\{schema\}\}/g, SCHEMA)
    .split(/;\s*$/m)
    .map((part) => part.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean);
}

async function runFile(relativePath) {
  const statements = statementsIn(readFileSync(join(root, relativePath), "utf8"));
  console.log(`\n${relativePath} — ${statements.length} statements`);
  for (const [index, statement] of statements.entries()) {
    process.stdout.write(`  [${index + 1}/${statements.length}] ${statement.split("\n")[0].slice(0, 62)} … `);
    await runSql(statement);
    console.log("ok");
  }
}

/* ------------------------------------------------------------------- csv -- */

/** Minimal RFC4180 reader: the generator quotes fields containing , " or newline. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (char !== "\r") field += char;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.length && r.some((c) => c !== ""));
}

/** Empty CSV cells become SQL NULL; everything else is a quoted literal and
 *  cast by Delta on insert, so types stay owned by the DDL. */
function sqlLiteral(value) {
  if (value === "") return "NULL";
  return `'${value.replace(/'/g, "''")}'`;
}

const BATCH = 250;

async function loadTable(table, columns, rows) {
  await runSql(`DELETE FROM ${CATALOG}.${SCHEMA}.${table}`);
  for (let start = 0; start < rows.length; start += BATCH) {
    const chunk = rows.slice(start, start + BATCH);
    const values = chunk.map((row) => `(${row.map(sqlLiteral).join(",")})`).join(",");
    await runSql(`INSERT INTO ${CATALOG}.${SCHEMA}.${table} (${columns.join(",")}) VALUES ${values}`);
    process.stdout.write(`\r  ${table.padEnd(22)} ${Math.min(start + BATCH, rows.length)}/${rows.length}   `);
  }
  console.log(`\r  ${table.padEnd(22)} ${rows.length}/${rows.length}   `);
}

/* ------------------------------------------------------------------- run -- */

await runFile("databricks/ddl/002_campus_dataset.sql");

console.log("\nloading CSVs");
const files = readdirSync(DATA_DIR).filter((f) => f.endsWith(".csv")).sort();
if (!files.length) {
  console.error("No CSVs found. Run: node scripts/generate-campus-dataset.mjs");
  process.exit(1);
}
let loaded = 0;
for (const file of files) {
  const [header, ...rows] = parseCsv(readFileSync(join(DATA_DIR, file), "utf8"));
  await loadTable(file.replace(/\.csv$/, ""), header, rows);
  loaded += rows.length;
}

await runFile("databricks/ddl/003_alignment_views.sql");
await runFile("databricks/ddl/004_research_search.sql");

const counts = await runSql(
  files.map((f) => f.replace(/\.csv$/, ""))
    .map((t) => `SELECT '${t}' AS t, COUNT(*) AS n FROM ${CATALOG}.${SCHEMA}.${t}`)
    .join(" UNION ALL ") + " ORDER BY t",
);
console.log(`\nloaded ${loaded} rows`);
for (const [table, n] of counts.result?.data_array ?? []) console.log(`  ${table.padEnd(22)} ${n}`);
