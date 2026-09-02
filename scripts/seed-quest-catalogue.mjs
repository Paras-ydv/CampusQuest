#!/usr/bin/env node
/**
 * Writes the quest catalogue into Supabase from the committed skill paths.
 *
 *   node scripts/seed-quest-catalogue.mjs [--dry-run]
 *
 * Emitted as a script rather than a SQL migration because the catalogue is
 * derived data: it changes whenever an outline, the skill map or the goal-role
 * mapping changes, and hand-transcribing 135 quests and 700 steps into SQL is
 * how they drift apart. Existing progress is untouched — quests are upserted by
 * id, and `user_quests` rows are never deleted, so completed history and earned
 * XP survive a re-seed.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY: the catalogue is not student-writable.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry-run");

const SB = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SB || !KEY) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  process.exit(1);
}

async function rest(path, init = {}) {
  const response = await fetch(`${SB}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY, Authorization: `Bearer ${KEY}`,
      "Content-Type": "application/json", ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? "GET"} ${path} → ${response.status} ${await response.text()}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/* ------------------------------------------------- read the catalogue -- */

/**
 * The paths live in TypeScript the app imports. Rather than duplicate the
 * merge logic here, the file is parsed for its authored half and combined with
 * the generated JSON exactly as `skillPathDefinitions()` does.
 */
const generated = JSON.parse(readFileSync(join(ROOT, "apps/web/lib/data/skill-paths.generated.json"), "utf8"));
const pathsSrc = readFileSync(join(ROOT, "apps/web/lib/skill-paths.ts"), "utf8");
const skillsSrc = readFileSync(join(ROOT, "apps/web/lib/data/skills.ts"), "utf8");
const rolesSrc = readFileSync(join(ROOT, "apps/web/lib/data/skill-roles.ts"), "utf8");
const familiesSrc = readFileSync(join(ROOT, "apps/web/lib/data/role-families.ts"), "utf8");

const SKILLS = Object.fromEntries(
  [...skillsSrc.matchAll(/^ {2}\w+: \{ id: "(\w+)", name: "([^"]+)", category: "(\w+)" \},/gm)]
    .map((m) => [m[1], { name: m[2], category: m[3] }]),
);

const ALL_GOALS = ["ROLE_FAMILIES", "MARKET_GOAL_ROLES"].flatMap((name) => {
  const body = familiesSrc.slice(familiesSrc.indexOf(`export const ${name}`));
  return [...body.slice(0, body.indexOf("] as const")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
});

const GOAL_ROLES = Object.fromEntries(
  [...rolesSrc.slice(rolesSrc.indexOf("SKILL_GOAL_ROLES"), rolesSrc.indexOf("export function goalRolesForSkill"))
    .matchAll(/^ {2}(\w+): \[([^\]]*)\],/gm)]
    .map((m) => {
      const raw = m[2].split(",").map((s) => s.trim()).filter(Boolean);
      return [m[1], raw.some((r) => r.startsWith("...")) ? ALL_GOALS : raw.map((r) => r.replace(/^"|"$/g, ""))];
    }),
);

/** The authored paths, read out of skill-paths.ts in declaration order. */
function authoredPaths() {
  const body = pathsSrc.slice(pathsSrc.indexOf("const authoredSkills"), pathsSrc.indexOf("const roadmapSkills"));
  const out = [];
  for (const m of body.matchAll(/^ {2}(\w+): detailed\(/gm)) {
    const start = m.index + m[0].length;
    // Walk to the matching close paren so multi-line definitions parse too.
    let depth = 1, i = start, inString = false;
    while (i < body.length && depth > 0) {
      const ch = body[i];
      if (inString) { if (ch === '"' && body[i - 1] !== "\\") inString = false; }
      else if (ch === '"') inString = true;
      else if (ch === "(" || ch === "[") depth += 1;
      else if (ch === ")" || ch === "]") depth -= 1;
      i += 1;
    }
    const args = body.slice(start, i - 1);
    const arrays = [];
    let depth2 = 0, from = -1;
    for (let j = 0; j < args.length; j += 1) {
      if (args[j] === "[") { if (depth2 === 0) from = j; depth2 += 1; }
      else if (args[j] === "]") { depth2 -= 1; if (depth2 === 0) arrays.push(args.slice(from, j + 1)); }
    }
    const name = args.match(/^"([^"]+)"/)?.[1];
    const levels = arrays.slice(0, 3).map((a) => [...a.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((s) => s[1].replace(/\\"/g, '"')));
    if (!name || levels.length !== 3) throw new Error(`could not parse authored path ${m[1]}`);
    out.push({ skillId: m[1], skillName: name, levels: levels.map((steps, index) => ({ level: index + 1, steps })) });
  }
  return out;
}

const authored = authoredPaths();
const authoredIds = new Set(authored.map((p) => p.skillId));
const catalogue = [
  ...generated.paths.filter((p) => !authoredIds.has(p.skillId)),
  ...authored,
].map((path) => ({
  ...path,
  skillCategory: SKILLS[path.skillId]?.category ?? "practice",
  // Union with the skills folded into this roadmap, matching
  // `skillPathDefinitions()`: a shared roadmap serves every one of them.
  goalRoles: [
    ...new Set([
      ...(GOAL_ROLES[path.skillId] ?? []),
      ...(path.alsoCovers ?? []).flatMap((covered) => GOAL_ROLES[covered] ?? []),
    ]),
  ],
}));

const missingRoles = catalogue.filter((p) => !p.goalRoles.length);
if (missingRoles.length) {
  console.error("No goal roles for: " + missingRoles.map((p) => p.skillId).join(", "));
  process.exit(1);
}

/* ------------------------------------------------------------- build rows -- */

const LEVEL_NAMES = ["Foundation", "Applied practice", "Portfolio capstone"];
const RARITY = ["common", "rare", "legendary"];
const XP = [60, 100, 160];
const HOURS = [4, 7, 12];
const DIFFICULTY = ["intro", "intermediate", "advanced"];

/** "JavaScript Roadmap" → "JavaScript", so the sentence does not say it twice. */
function roadmapName(title) {
  return title.replace(/\s+(Roadmap|Developer)$/i, "");
}

function summaryFor(path, index) {
  if (!path.roadmapTitle) {
    return `Verified ${["foundation", "applied practice", "portfolio capstone"][index]} milestone for ${path.skillName}.`;
  }
  const third = ["Opening", "Middle", "Closing"][index];
  // Say what else the path covers, so a student looking for Kafka recognises
  // the Data Engineer path as the place it lives.
  const covers = (path.alsoCovers ?? []).length
    ? ` Also covers ${path.alsoCovers.map((id) => SKILLS[id]?.name ?? id).join(", ")}.`
    : "";
  return `${third} third of the ${roadmapName(path.roadmapTitle)} roadmap, built into one project.${covers}`;
}

const quests = [];
const steps = [];
const questSkills = [];

for (const path of catalogue) {
  for (const level of path.levels) {
    const index = level.level - 1;
    const id = `q_${path.skillId}_l${level.level}`;
    quests.push({
      id,
      title: `${path.displayName ?? path.skillName}: ${LEVEL_NAMES[index]}`,
      summary: summaryFor(path, index),
      category: "learn",
      rarity: RARITY[index],
      xp: XP[index],
      estimated_hours: HOURS[index],
      why_template: `${path.displayName ?? path.skillName} is a tracked skill gap for ${path.goalRoles.slice(0, 3).join(", ")}.`,
      difficulty: DIFFICULTY[index],
      goal_roles: path.goalRoles,
      path_skill_id: path.skillId,
      path_level: level.level,
      prerequisite_quest_id: level.level === 1 ? null : `q_${path.skillId}_l${level.level - 1}`,
      is_retired: false,
    });
    level.steps.forEach((label, i) => {
      steps.push({
        id: `${id}_s${i + 1}`,
        quest_id: id,
        label,
        // Zero-based, matching the rows already in the table: a 1-based order
        // collides with the existing (quest_id, sort_order) unique key.
        sort_order: i,
        verification_type: label.includes("GitHub Actions") ? "github_workflow" : "github_file",
      });
    });
    // Only the capstone grants the skill; one level of three is not holding it.
    if (level.level === 3) questSkills.push({ quest_id: id, skill_id: path.skillId });
  }
}

console.log(`${catalogue.length} paths → ${quests.length} quests, ${steps.length} steps`);
if (DRY) {
  console.log(quests.slice(0, 2), steps.slice(0, 3));
  process.exit(0);
}

/* ------------------------------------------------------------------ write -- */

const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
const upsert = async (table, rows, conflict) => {
  for (const part of chunk(rows, 200)) {
    await rest(`${table}?on_conflict=${conflict}`, {
      method: "POST", headers: { Prefer: "resolution=merge-duplicates" }, body: JSON.stringify(part),
    });
  }
};

// Prerequisites reference other quests, so insert the rows before the links.
await upsert("quests", quests.map(({ prerequisite_quest_id: _p, ...rest }) => rest), "id");
await upsert("quests", quests, "id");
await upsert("quest_steps", steps, "id");
await upsert("quest_skills", questSkills, "quest_id,skill_id");

/*
 * Retire anything the catalogue no longer contains rather than deleting it:
 * a student may have completed it, and `user_quests` references the row.
 */
const keep = new Set(quests.map((q) => q.id));
const existing = await rest("quests?select=id,is_retired");
const stale = existing.filter((row) => !keep.has(row.id) && row.id !== "q_team" && !row.is_retired);
for (const row of stale) {
  await rest(`quests?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", body: JSON.stringify({ is_retired: true }) });
}

// Steps of a quest that shrank would otherwise block completion forever.
const stepIds = new Set(steps.map((s) => s.id));
const existingSteps = await rest("quest_steps?select=id,quest_id");
const orphanSteps = existingSteps.filter((row) => keep.has(row.quest_id) && !stepIds.has(row.id));
for (const row of orphanSteps) {
  await rest(`quest_steps?id=eq.${encodeURIComponent(row.id)}`, { method: "DELETE" });
}

console.log(`Seeded. Retired ${stale.length} replaced quests, removed ${orphanSteps.length} stale steps.`);
