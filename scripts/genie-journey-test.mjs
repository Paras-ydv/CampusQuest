#!/usr/bin/env node
/**
 * Asks the three questions the Journey screen suggests, and checks each answer
 * against SQL run independently against the same warehouse.
 *
 *   node scripts/genie-journey-test.mjs [base-url]
 *
 * Genie writing fluent prose over the wrong numbers is the failure mode that
 * matters here, and it is invisible from the UI. Every one of these checks
 * failed when it was written:
 *
 *   - "What should I learn next?" answered for ML Engineer while the student's
 *     goal was Frontend Engineer, because the answer cache was keyed on the
 *     question and the user id but not on the profile the answer came from.
 *   - "Where do I stand?" said 4 roles instead of 14: Genie was given skill
 *     display names and guessed the join key, inventing the slugs 'restapis'
 *     and 'scikit-learn', so REST APIs and scikit-learn silently left the
 *     held set.
 *   - "Biggest gap" reported a count under the wrong label, because the
 *     question asked for one number and the SQL computed a different one.
 */
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
        DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_SQL_WAREHOUSE_ID } = process.env;
for (const [name, value] of Object.entries({ SB, ANON, DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_SQL_WAREHOUSE_ID })) {
  if (!value) { console.error(`${name} is required`); process.exit(1); }
}

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

/* ------------------------------------------------------- ground truth -- */

const HOST = DATABRICKS_HOST.replace(/\/$/, "");
async function sql(statement) {
  let r = await (await fetch(`${HOST}/api/2.0/sql/statements`, {
    method: "POST",
    headers: { Authorization: `Bearer ${DATABRICKS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ warehouse_id: DATABRICKS_SQL_WAREHOUSE_ID, statement, wait_timeout: "50s" }),
  })).json();
  while (["PENDING", "RUNNING"].includes(r.status?.state)) {
    await new Promise((s) => setTimeout(s, 1500));
    r = await (await fetch(`${HOST}/api/2.0/sql/statements/${r.statement_id}`,
      { headers: { Authorization: `Bearer ${DATABRICKS_TOKEN}` } })).json();
  }
  if (r.status?.state !== "SUCCEEDED") throw new Error(r.status?.error?.message ?? r.status?.state);
  return r.result?.data_array ?? [];
}

/** Roles in `family` the holder of `held` clears the 50% weighted bar for. */
const alignedRoles = async (family, held) => Number((await sql(`
  WITH held AS (SELECT skill_id FROM workspace.campusquest.skills WHERE slug IN (${held.map((s) => `'${s}'`).join(",")})),
  w AS (
    SELECT jr.role_id,
           SUM(CASE WHEN jr.importance='core' THEN 2 ELSE 1 END) AS total,
           SUM(CASE WHEN jr.skill_id IN (SELECT skill_id FROM held)
                    THEN (CASE WHEN jr.importance='core' THEN 2 ELSE 1 END) ELSE 0 END) AS covered
    FROM workspace.campusquest.job_requirements jr
    JOIN workspace.campusquest.job_roles j ON j.role_id = jr.role_id
    WHERE j.role_family = '${family}' GROUP BY jr.role_id)
  SELECT SUM(CASE WHEN covered >= 0.5 * total THEN 1 ELSE 0 END) FROM w`))[0][0]);

const rolesRequesting = async (family, slug) => Number((await sql(`
  SELECT COUNT(DISTINCT jr.role_id)
  FROM workspace.campusquest.job_requirements jr
  JOIN workspace.campusquest.job_roles j ON j.role_id = jr.role_id
  JOIN workspace.campusquest.skills s ON s.skill_id = jr.skill_id
  WHERE j.role_family = '${family}' AND s.slug = '${slug}'`))[0][0]);

/* -------------------------------------------------------------- genie -- */

const auth = await (async () => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "kartikeya@campus.edu", password: process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo" }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error("sign-in failed");
  return { Authorization: `Bearer ${body.access_token}`, "Content-Type": "application/json" };
})();

async function ask(question) {
  const res = await fetch(`${BASE}/api/genie/ask`, { method: "POST", headers: auth, body: JSON.stringify({ question }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "", statement = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let split;
    while ((split = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, split); buffer = buffer.slice(split + 2);
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let event; try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (event.type === "delta" && event.text) text += event.text;
      if (event.type === "sql" && event.sql) statement = event.sql;
    }
  }
  return { text, sql: statement };
}

/* ------------------------------------------------------------- checks -- */

const profile = await (await fetch(`${BASE}/api/profile`, { headers: auth })).json();
const family = profile.goalRole;
const held = profile.skills.map((s) => s.skill?.id ?? s.id).filter(Boolean);
console.log(`Journey Genie against ${BASE}`);
console.log(`Student: ${profile.name}, goal ${family}, holds ${held.length} skills\n`);

const { genieSuggestionsFor } = await import("../apps/web/lib/data/genie-context.ts").catch(() => ({}));
const QUESTIONS = genieSuggestionsFor
  ? genieSuggestionsFor("/journey").map((s) => s.question)
  : [
      "What should I learn next for my goal role, and why?",
      "How many historical roles in my target family do I currently align with?",
      "Which single skill would improve my alignment the most? Report both how many roles in my target family request that skill, and how many additional roles I would align with after learning it.",
    ];

console.log("1. Every answer is about the goal the student actually chose");
const answers = [];
for (const question of QUESTIONS) {
  const answer = await ask(question);
  answers.push(answer);
  const other = ["ML Engineer", "Backend Engineer", "Data Engineer", "Mobile Engineer"]
    .filter((f) => f !== family)
    .find((f) => answer.sql.includes(`'${f}'`));
  check(`"${question.slice(0, 46)}…" targets ${family}`, !other, other ? `queried ${other}` : "");
}

console.log("\n2. The held skills reach Genie as real slugs");
for (const [i, answer] of answers.entries()) {
  const invented = [...answer.sql.matchAll(/slug\s+(?:NOT\s+)?IN\s*\(([^)]*)\)/gi)]
    .flatMap((m) => [...m[1].matchAll(/'([^']+)'/g)].map((s) => s[1]))
    .filter((slug) => !held.includes(slug));
  check(`answer ${i + 1} uses only slugs the student holds`, invented.length === 0, invented.slice(0, 4).join(", "));
}

console.log("\n3. And no answer borrows another student's figures");
for (const [i, answer] of answers.entries()) {
  /*
   * Schema-qualified only. A bare name match flagged a correct answer that
   * happened to name one of its own CTEs `role_alignment` — the check has to
   * be about reading the view, not about the word.
   */
  const reads = /campusquest`?\s*\.\s*`?(skill_gap_view|role_alignment|students)\b/i;
  const hit = answer.sql.match(reads);
  check(`answer ${i + 1} avoids the synthetic per-student views`, !hit, hit?.[0] ?? "");
}

console.log("\n4. The numbers match SQL run independently");
{
  const aligned = await alignedRoles(family, held);
  check(`"where do I stand" says ${aligned}`, new RegExp(`\\b${aligned}\\b`).test(answers[1].text),
        answers[1].text.slice(0, 120));

  // The biggest gap by the app's own rule: the skill that newly aligns the most.
  const gaps = (await (await fetch(`${BASE}/api/timemachine/alignment`, { headers: auth })).json()).gaps ?? [];
  const top = gaps[0]?.skill?.id;
  check("the app and Genie agree on the biggest gap", top && answers[2].text.toLowerCase().includes(top.toLowerCase()),
        `app says ${top}`);

  if (top) {
    const requesting = await rolesRequesting(family, top);
    const after = await alignedRoles(family, [...held, top]);
    check(`it reports ${requesting} roles requesting ${top}`, new RegExp(`\\b${requesting}\\b`).test(answers[2].text));
    check(`and ${after - aligned} additional roles aligned`, new RegExp(`\\b${after - aligned}\\b`).test(answers[2].text),
          answers[2].text.slice(0, 160));
  }
}

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
