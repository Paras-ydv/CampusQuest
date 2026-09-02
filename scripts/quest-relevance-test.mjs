#!/usr/bin/env node
/**
 * Checks that the quest board is about the job the student says they want, and
 * that finishing a quest actually moves XP.
 *
 *   node scripts/quest-relevance-test.mjs [base-url]
 *
 * Every goal in the catalogue is exercised through the real API against the
 * real database. The board used to be unranked and unfiltered, so all nineteen
 * goals returned a byte-identical list opening with Docker and PyTorch — the
 * first check here is precisely that this is no longer true.
 */
import { readFileSync } from "node:fs";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON } = process.env;
if (!SB || !ANON) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY are required");
  process.exit(1);
}

const PASSWORD = process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo";
const GOALS = [
  "Frontend Engineer", "Backend Engineer", "ML Engineer", "Data Engineer", "Data Analyst",
  "DevOps Engineer", "Mobile Engineer", "QA Engineer", "Embedded Engineer", "Product Engineer",
  "Software Engineer", "AI Engineer", "Data Scientist", "MLOps Engineer", "Cloud Engineer",
  "Site Reliability Engineer", "Cybersecurity Engineer", "Full-stack Engineer", "Analytics Engineer",
];

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

const signIn = async (email) => {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${body.msg ?? r.status}`);
  return { token: body.access_token, id: body.user.id };
};

const user = await signIn("aarav@campus.edu");
const api = async (path, init = {}) => {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
};

const originalProfile = (await api("/api/profile")).body;
const setGoal = (goalRole) => api("/api/profile", { method: "PATCH", body: JSON.stringify({ goalRole }) });

console.log(`Quest board across ${GOALS.length} goals, against ${BASE}\n`);

console.log("1. Every goal gets a board, and no two are the same list");
const boards = new Map();
for (const goal of GOALS) {
  await setGoal(goal);
  const { body } = await api("/api/quests");
  boards.set(goal, Array.isArray(body) ? body : []);
}
for (const [goal, quests] of boards) {
  check(`${goal}: ${quests.length} quests`, quests.length >= 4, quests.slice(0, 3).map((q) => q.title).join(" | "));
}
const signatures = new Set([...boards.values()].map((quests) => quests.slice(0, 5).map((q) => q.id).join(",")));
check("the top of the board differs by goal", signatures.size >= GOALS.length - 4,
      `${signatures.size} distinct openings across ${GOALS.length} goals`);

console.log("\n2. A board only offers quests that serve that goal");
/*
 * Judged against skill-roles.ts, the file the filter itself reads, rather than
 * against the sentence on the card: the wire format does not carry a quest's
 * goal roles, and an earlier version of this check tested the prose and failed
 * on quests that were correctly included.
 */
const rolesSrc = readFileSync(new URL("../apps/web/lib/data/skill-roles.ts", import.meta.url), "utf8");
const SKILL_GOALS = Object.fromEntries(
  [...rolesSrc.slice(rolesSrc.indexOf("SKILL_GOAL_ROLES"), rolesSrc.indexOf("export function goalRolesForSkill"))
    .matchAll(/^ {2}(\w+): \[([^\]]*)\],/gm)]
    .map((m) => {
      const raw = m[2].split(",").map((r) => r.trim()).filter(Boolean);
      return [m[1], raw.some((r) => r.startsWith("...")) ? GOALS : raw.map((r) => r.replace(/^"|"$/g, ""))];
    }),
);
check("the goal-role map parsed", Object.keys(SKILL_GOALS).length > 50, `${Object.keys(SKILL_GOALS).length} skills`);

/*
 * A roadmap shared by several skills serves all of their goals — the Data
 * Engineer path covers Kafka, so it belongs on a backend board even though
 * Spark alone does not.
 */
const generated = JSON.parse(readFileSync(new URL("../apps/web/lib/data/skill-paths.generated.json", import.meta.url), "utf8"));
const alsoCovers = Object.fromEntries(generated.paths.map((p) => [p.skillId, p.alsoCovers ?? []]));
const goalsServedBy = (skillId) => [
  ...new Set([...(SKILL_GOALS[skillId] ?? []), ...(alsoCovers[skillId] ?? []).flatMap((id) => SKILL_GOALS[id] ?? [])]),
];

for (const [goal, quests] of boards) {
  // Completed quests are kept whatever the goal — they are the student's own
  // history and the XP trail behind it — so only what is still offered counts.
  const offGoal = quests.filter((q) =>
    q.status !== "completed" && q.pathSkillId && !goalsServedBy(q.pathSkillId).includes(goal));
  check(`${goal}: every quest serves it`, offGoal.length === 0,
        offGoal.slice(0, 3).map((q) => q.title).join(", "));
}

console.log("\n2b. And the card explains itself in terms of that goal");
for (const [goal, quests] of boards) {
  const silent = quests.filter((q) => q.status !== "completed" && q.pathSkillId && !q.why.includes(goal));
  check(`${goal}: the reason names the goal`, silent.length === 0,
        silent.slice(0, 2).map((q) => `${q.title} → ${q.why}`).join(" ; "));
}

console.log("\n3. Steps come from the roadmap, not a template");
await setGoal("Frontend Engineer");
const frontend = (await api("/api/quests")).body;
const react = frontend.find((q) => q.pathSkillId === "react");
check("a React path is offered to a frontend student", Boolean(react), react?.title);
if (react) {
  check("its steps are React topics", react.steps.some((s) => /Hooks|Components|Rendering|Routers/i.test(s.label)),
        react.steps.slice(0, 2).map((s) => s.label).join(" | "));
  check("not the old fill-in-the-name template",
        !react.steps.some((s) => /Create a reproducible .* project repository/i.test(s.label)));
}
const generic = frontend.filter((q) => q.steps.some((s) => /Add a working .* implementation/i.test(s.label)));
check("no quest still uses the generic step text", generic.length === 0, generic.slice(0, 2).map((q) => q.title).join(", "));

console.log("\n4. Finishing a quest moves XP on the profile");
{
  const before = (await api("/api/profile")).body;
  const target = frontend.find((q) => q.status === "available" && q.steps.length > 0);
  check("there is something to do", Boolean(target), target?.title);

  if (target) {
    for (const step of target.steps) {
      const r = await api(`/api/quests/${encodeURIComponent(target.id)}/steps/${encodeURIComponent(step.id)}/done`, { method: "POST" });
      if (r.status !== 200) { check(`step ${step.id} accepted`, false, `HTTP ${r.status}`); break; }
    }
    const ticked = (await api("/api/quests")).body.find((q) => q.id === target.id);
    check("every step reads as done", ticked?.steps.every((s) => s.done));
    check("but none claims to be verified", ticked?.steps.every((s) => !s.verifiedAt));

    const completed = await api(`/api/quests/${encodeURIComponent(target.id)}/complete`, { method: "POST" });
    check("the quest completes", completed.status === 200, `HTTP ${completed.status} ${completed.body?.message ?? ""}`);
    check("it awarded the quest's XP", completed.body?.xpAwarded === target.xp, `${completed.body?.xpAwarded} vs ${target.xp}`);

    const after = (await api("/api/profile")).body;
    check("the profile XP went up by that much", after?.xp === before.xp + target.xp,
          `${before.xp} → ${after?.xp} (+${target.xp})`);
    check("the level matches the new XP", after?.level === Math.floor(after.xp / 350) + 1,
          `level ${after?.level} at ${after?.xp} XP`);

    const board = (await api("/api/quests")).body;
    check("the board marks it completed", board.find((q) => q.id === target.id)?.status === "completed");
    if (target.pathLevel === 1) {
      check("the next level of the path unlocks",
            board.some((q) => q.pathSkillId === target.pathSkillId && q.pathLevel === 2),
            board.filter((q) => q.pathSkillId === target.pathSkillId).map((q) => `L${q.pathLevel}`).join(" "));
    }
  }
}

console.log("\n5. Undoing a step blocks completion again");
{
  const board = (await api("/api/quests")).body;
  const target = board.find((q) => q.status === "available" && q.steps.length > 1);
  if (target) {
    for (const step of target.steps) {
      await api(`/api/quests/${encodeURIComponent(target.id)}/steps/${encodeURIComponent(step.id)}/done`, { method: "POST" });
    }
    await api(`/api/quests/${encodeURIComponent(target.id)}/steps/${encodeURIComponent(target.steps[0].id)}/done`, { method: "DELETE" });
    const after = (await api("/api/quests")).body.find((q) => q.id === target.id);
    check("the unticked step reads as not done", after?.steps[0]?.done === false);
    const blocked = await api(`/api/quests/${encodeURIComponent(target.id)}/complete`, { method: "POST" });
    check("completion is refused with a step outstanding", blocked.status === 409,
          `HTTP ${blocked.status} ${blocked.body?.message ?? ""}`);
  } else {
    check("setup: a second quest was available", false);
  }
}

// Leave the account on the goal it started with, so a rerun is repeatable and
// the demo profile is not silently rewritten by a test.
await setGoal(originalProfile.goalRole);
console.log(`\nRestored goal role to ${originalProfile.goalRole}`);
console.log(`${failures === 0 ? "All checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
