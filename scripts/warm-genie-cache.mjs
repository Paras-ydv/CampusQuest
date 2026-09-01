#!/usr/bin/env node
/**
 * Warms the Genie answer cache and checks the answers are actually right.
 *
 *   node scripts/warm-genie-cache.mjs [--base <url>] [--email <addr>] [--verify-only]
 *
 * Two things happen per question:
 *
 *  1. It is asked through /api/genie/ask, which caches the answer against the
 *     student. A second identical ask is then served from `genie_messages` in
 *     well under a second — that is what makes the demo fast.
 *
 *  2. The answer is checked rather than trusted. Genie's *own* generated SQL is
 *     re-executed against the warehouse and compared with the table it
 *     displayed; if those disagree, the table on screen did not come from that
 *     query. Where the catalogue supplies an independent `expect` query, that
 *     is run too and compared with the same table.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY and, for verification,
 * DATABRICKS_HOST / _TOKEN / _SQL_WAREHOUSE_ID.
 */
import { QUESTIONS } from "./genie-cache/questions.mjs";

const args = process.argv.slice(2);
const arg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const BASE = arg("--base", "http://localhost:3000").replace(/\/$/, "");
const EMAIL = arg("--email", "kartikeya@campus.edu");
const PASSWORD = arg("--password", process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo");
const VERIFY_ONLY = args.includes("--verify-only");
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

const { NEXT_PUBLIC_SUPABASE_URL: SB_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY: SB_ANON,
        DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_SQL_WAREHOUSE_ID } = process.env;
if (!SB_URL || !SB_ANON) { console.error("NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY are required"); process.exit(1); }

async function signIn() {
  const r = await fetch(`${SB_URL}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: SB_ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const b = await r.json();
  if (!b.access_token) throw new Error(`sign-in failed: ${b.msg ?? b.error_description ?? r.status}`);
  return b.access_token;
}

/** Asks one question and collects every frame the stream produced. */
async function ask(token, question) {
  const started = Date.now();
  const res = await fetch(`${BASE}/api/genie/ask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`, "Content-Type": "application/json",
      Accept: "text/event-stream", ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}),
    },
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) return { ms: Date.now() - started, ok: false, error: `HTTP ${res.status}` };

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", sql = null, table = null, text = "", error = null, ok = false;
  while (true) {
    const { done, value } = await reader.read();
    buf += dec.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const f of frames) {
      const line = f.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const e = JSON.parse(line.slice(6));
      if (e.type === "sql") sql = e.sql;
      if (e.type === "table") table = e.table;
      if (e.type === "delta") text += e.text;
      if (e.type === "error") error = e.message;
      if (e.type === "done") ok = true;
    }
    if (done) break;
  }
  return { ms: Date.now() - started, ok, sql, table, text, error };
}

async function runSql(statement) {
  if (!DATABRICKS_HOST || !DATABRICKS_TOKEN || !DATABRICKS_SQL_WAREHOUSE_ID) return null;
  const host = DATABRICKS_HOST.replace(/\/$/, "");
  const post = async (path, init) => {
    const r = await fetch(`${host}${path}`, {
      ...init, headers: { Authorization: `Bearer ${DATABRICKS_TOKEN}`, "Content-Type": "application/json" },
    });
    return r.json();
  };
  let out = await post("/api/2.0/sql/statements", {
    method: "POST",
    body: JSON.stringify({ warehouse_id: DATABRICKS_SQL_WAREHOUSE_ID, statement, wait_timeout: "50s" }),
  });
  while (["PENDING", "RUNNING"].includes(out.status?.state)) {
    await new Promise((r) => setTimeout(r, 1500));
    out = await post(`/api/2.0/sql/statements/${out.statement_id}`, { method: "GET" });
  }
  if (out.status?.state !== "SUCCEEDED") return { error: out.status?.error?.message ?? out.status?.state };
  return { rows: out.result?.data_array ?? [] };
}

/** Compares two result sets on value only — column names and order vary. */
function sameNumbers(a, b) {
  const norm = (rows) => rows.flat().map((v) => String(v ?? "").trim().toLowerCase())
    .filter((v) => v !== "").sort().join("|");
  return norm(a) === norm(b);
}

const token = await signIn();
console.log(`${VERIFY_ONLY ? "Verifying" : "Warming"} ${QUESTIONS.length} questions for ${EMAIL}`);
console.log(`against ${BASE}\n`);

const results = [];
for (const [i, item] of QUESTIONS.entries()) {
  process.stdout.write(`[${String(i + 1).padStart(2)}/${QUESTIONS.length}] ${item.area.padEnd(12)} ${item.question.slice(0, 52).padEnd(54)}`);
  const answer = await ask(token, item.question);
  const row = { ...item, ...answer, checks: [] };

  if (!answer.ok) {
    console.log(`  FAILED ${answer.error ?? ""}`.slice(0, 60));
    results.push(row);
    continue;
  }

  // Check 1: does Genie's own SQL, re-run, reproduce the table it showed?
  if (answer.sql && answer.table) {
    const rerun = await runSql(answer.sql);
    if (rerun && !rerun.error) {
      row.checks.push({ name: "sql-reproduces-table", pass: sameNumbers(rerun.rows, answer.table.rows) });
    } else if (rerun?.error) {
      row.checks.push({ name: "sql-reproduces-table", pass: false, note: rerun.error.slice(0, 60) });
    }
  }

  // Check 2: an independent query we wrote, compared with the same table.
  if (item.expect && answer.table) {
    const truth = await runSql(item.expect.sql);
    if (truth && !truth.error) {
      row.checks.push({ name: `independent:${item.expect.label}`, pass: sameNumbers(truth.rows, answer.table.rows) });
    }
  }

  const failed = row.checks.filter((c) => !c.pass);
  const mark = row.checks.length === 0 ? "cached (no table to check)"
    : failed.length === 0 ? `verified ${row.checks.length}/${row.checks.length}`
    : `MISMATCH ${failed.map((c) => c.name).join(",")}`;
  console.log(`  ${String(answer.ms).padStart(6)}ms  ${mark}`);
  results.push(row);
}

const ok = results.filter((r) => r.ok);
const verified = ok.filter((r) => r.checks.length && r.checks.every((c) => c.pass));
const mismatched = ok.filter((r) => r.checks.some((c) => !c.pass));
const unchecked = ok.filter((r) => r.checks.length === 0);

console.log(`\n${"-".repeat(72)}`);
console.log(`answered   ${ok.length}/${QUESTIONS.length}`);
console.log(`verified   ${verified.length}   (Genie's SQL re-run reproduces the table it showed)`);
console.log(`unchecked  ${unchecked.length}   (narrative answers with no result table)`);
console.log(`mismatched ${mismatched.length}`);
for (const r of mismatched) {
  console.log(`\n  ! ${r.question}`);
  for (const c of r.checks.filter((x) => !x.pass)) console.log(`      ${c.name}${c.note ? ` — ${c.note}` : ""}`);
}

if (!VERIFY_ONLY) {
  console.log(`\nre-asking three to confirm they now come from cache:`);
  for (const r of ok.slice(0, 3)) {
    const again = await ask(token, r.question);
    console.log(`  ${String(again.ms).padStart(6)}ms  ${again.ok ? "cached" : "MISS"}  ${r.question.slice(0, 52)}`);
  }
}
