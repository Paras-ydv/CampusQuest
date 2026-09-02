#!/usr/bin/env node
/**
 * Builds the quest catalogue from the committed roadmap outlines.
 *
 *   node scripts/roadmap/build-skill-paths.mjs [--check]
 *
 * Every skill that maps to a roadmap gets a three-level path whose steps are
 * the roadmap's own topics, split into thirds. Before this, all 25 paths in the
 * database shared one set of steps with the skill name substituted in — "Create
 * a reproducible React project repository", "Build a small working React
 * exercise" — which told a student nothing about React and was identical to the
 * Terraform path. Deriving from the outline means the Frontend student's React
 * capstone lists Hooks, State Management and Testing, because that is what the
 * React roadmap contains.
 *
 * The output is committed (`apps/web/lib/data/skill-paths.generated.json`) for
 * the same reason the outlines are: it is reviewable in a diff, and the app
 * must not depend on regenerating it at request time. `--check` re-derives and
 * fails if the committed copy has drifted.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUTLINES = join(ROOT, "apps/web/lib/roadmap/outlines");
const OUT = join(ROOT, "apps/web/lib/data/skill-paths.generated.json");

/* ------------------------------------------------------------ inputs ---- */

/**
 * The three source files are TypeScript the app imports, so they are parsed
 * rather than imported: this script has to run under plain node, before any
 * build step, and duplicating their contents here would let them drift.
 */
function parseSkillMap() {
  const src = readFileSync(join(ROOT, "apps/web/lib/roadmap/skill-map.ts"), "utf8");
  const body = src.slice(src.indexOf("SKILL_ROADMAPS"), src.indexOf("export function roadmapForSkill"));
  const links = {};
  for (const m of body.matchAll(/^ {2}(\w+): \{ slug: "([\w-]+)", match: "(exact|broader)"(?:, note: "([^"]*)")? \},/gm)) {
    links[m[1]] = { slug: m[2], match: m[3], note: m[4] ?? null };
  }
  return links;
}

function parseSkills() {
  const src = readFileSync(join(ROOT, "apps/web/lib/data/skills.ts"), "utf8");
  const skills = {};
  for (const m of src.matchAll(/^ {2}(\w+): \{ id: "(\w+)", name: "([^"]+)", category: "(\w+)" \},/gm)) {
    skills[m[2]] = { name: m[3], category: m[4] };
  }
  return skills;
}

function parseGoalRoles() {
  const src = readFileSync(join(ROOT, "apps/web/lib/data/skill-roles.ts"), "utf8");
  const body = src.slice(src.indexOf("SKILL_GOAL_ROLES"), src.indexOf("export function goalRolesForSkill"));
  const goals = {};
  for (const m of body.matchAll(/^ {2}(\w+): \[([^\]]*)\],/gm)) {
    const roles = m[2].split(",").map((s) => s.trim()).filter(Boolean);
    // `git: [...GOAL_ROLE_CHOICES]` — the one entry that spreads the full list.
    goals[m[1]] = roles.some((r) => r.startsWith("..."))
      ? ALL_GOALS
      : roles.map((r) => r.replace(/^"|"$/g, ""));
  }
  return goals;
}

function parseAllGoals() {
  const src = readFileSync(join(ROOT, "apps/web/lib/data/role-families.ts"), "utf8");
  const grab = (name) => {
    const body = src.slice(src.indexOf(`export const ${name}`));
    return [...body.slice(0, body.indexOf("] as const")).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  };
  return [...grab("ROLE_FAMILIES"), ...grab("MARKET_GOAL_ROLES")];
}

const ALL_GOALS = parseAllGoals();

/* ------------------------------------------------------- step building -- */

/**
 * Topics worth putting in front of a student.
 *
 * The outlines are derived from roadmap.sh's canvas geometrically, and that
 * derivation emits a topic literally labelled "Prerequisites" wherever the
 * upstream diagram has an unlabelled cluster, plus heading nodes with no
 * children. Neither is a thing anyone can go and learn, so both are dropped
 * rather than shown as a quest step.
 */
function usableTopics(outline) {
  const seen = new Set();
  return outline.topics.filter((topic) => {
    const label = topic.label.trim();
    if (/^prerequisites?$/i.test(label)) return false;
    // Rhetorical section headings — "Why is it important?", "What is Machine
    // Learning?" — read as nonsense once turned into an instruction.
    if (label.endsWith("?")) return false;
    if (!topic.subtopics?.length) return false;
    const key = label.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Up to `limit` items spread across `items`, not just the first few. */
function spread(items, limit) {
  if (items.length <= limit) return items;
  const step = items.length / limit;
  return Array.from({ length: limit }, (_, i) => items[Math.floor(i * step)]);
}

function stepLabel(topic) {
  const subtopics = topic.subtopics.map((s) => s.label.trim()).filter(Boolean);
  let detail = "";
  for (const name of subtopics.slice(0, 3)) {
    const next = detail ? `${detail}, ${name}` : name;
    if (next.length > 64) break;
    detail = next;
  }
  return detail ? `${topic.label.trim()} — ${detail}` : topic.label.trim();
}

const LEVEL_NAMES = ["Foundation", "Applied practice", "Portfolio capstone"];

/**
 * Splits a roadmap into three levels.
 *
 * Outlines keep roadmap.sh's own ordering, which runs roughly from basics to
 * advanced, so contiguous thirds give a real progression. Small roadmaps —
 * Redis has seven usable topics — still yield at least two steps a level.
 */
function levelsFor(topics) {
  const third = Math.ceil(topics.length / 3);
  const slices = [topics.slice(0, third), topics.slice(third, third * 2), topics.slice(third * 2)];
  // A short tail can leave the last slice empty; borrow from the middle so a
  // capstone is never a lone CI step.
  if (!slices[2].length && slices[1].length > 1) slices[2] = [slices[1].pop()];
  return slices.map((slice, index) => spread(slice, index === 2 ? 4 : 5).map(stepLabel));
}

/* ------------------------------------------------------------- catalogue -- */

const links = parseSkillMap();
const skills = parseSkills();
const goalRoles = parseGoalRoles();

/*
 * One path per roadmap, not per skill.
 *
 * Six skills map to the Machine Learning roadmap as "broader" matches, so
 * deriving a path for each would hand PyTorch, TensorFlow, scikit-learn, NLP,
 * computer vision and Transformers the same five steps — reintroducing the
 * identical-quests problem this script exists to remove. A roadmap belongs to
 * the skill it is actually about: the "exact" match if there is one, otherwise
 * the designated representative below. The skills that lose their own path are
 * still reachable, through the roadmap panel on the skill page.
 */
const REPRESENTATIVE = {
  "machine-learning": "sklearn",
  "python-data-analysis": "pandas",
  "data-engineer": "spark",
  backend: "fastapi",
  "computer-science": "os",
  devops: "cicd",
};

function ownerOf(slug) {
  const exact = Object.entries(links).find(([, l]) => l.slug === slug && l.match === "exact");
  return exact ? exact[0] : REPRESENTATIVE[slug];
}

const paths = [];
const problems = [];
const covered = [];

for (const [skillId, link] of Object.entries(links)) {
  if (ownerOf(link.slug) !== skillId) {
    covered.push(`${skillId} (covered by ${ownerOf(link.slug) ?? link.slug})`);
    continue;
  }
  const skill = skills[skillId];
  if (!skill) { problems.push(`${skillId}: not in the skill catalogue`); continue; }
  const file = join(OUTLINES, `${link.slug}.json`);
  if (!existsSync(file)) { problems.push(`${skillId}: no outline for ${link.slug}`); continue; }

  const outline = JSON.parse(readFileSync(file, "utf8"));
  const topics = usableTopics(outline);
  if (topics.length < 4) { problems.push(`${skillId}: only ${topics.length} usable topics in ${link.slug}`); continue; }

  const roles = goalRoles[skillId] ?? [];
  if (!roles.length) { problems.push(`${skillId}: no goal roles`); continue; }

  const levels = levelsFor(topics).map((steps, index) => ({
    level: index + 1,
    name: LEVEL_NAMES[index],
    // The capstone is the only level that ends in a CI check, matching the
    // verification design: the workflow is what proves the project runs.
    steps: index === 2 ? [...steps, "Pass the GitHub Actions workflow"] : steps,
  }));

  const alsoCovers = Object.entries(links)
    .filter(([id, l]) => l.slug === link.slug && id !== skillId)
    .map(([id]) => id);

  /*
   * A path covering several skills is named after the roadmap, not after the
   * one skill that happens to own it. "Spark: Foundation" appearing on a
   * backend student's board because the path also covers Kafka is technically
   * right and reads as a mistake; "Data Engineering: Foundation" does not.
   */
  const displayName = alsoCovers.length
    ? outline.title.replace(/\s+(Roadmap|Developer)$/i, "")
    : skill.name;

  paths.push({
    skillId,
    displayName,
    skillName: skill.name,
    skillCategory: skill.category,
    roadmapSlug: link.slug,
    roadmapTitle: outline.title,
    roadmapMatch: link.match,
    roadmapNote: link.note,
    goalRoles: [...new Set([...roles, ...alsoCovers.flatMap((id) => goalRoles[id] ?? [])])],
    alsoCovers,
    levels,
  });
}

paths.sort((a, b) => a.skillId.localeCompare(b.skillId));

const catalogue = {
  // Regenerate with `npm run quests:build` after editing an outline, the skill
  // map or the goal-role mapping.
  generatedFrom: "apps/web/lib/roadmap/outlines",
  paths,
};

if (problems.length) {
  console.error("Skipped:\n  " + problems.join("\n  "));
}
if (covered.length) {
  console.log(`Folded into a shared roadmap: ${covered.join(", ")}`);
}

const serialized = JSON.stringify(catalogue, null, 2) + "\n";

if (process.argv.includes("--check")) {
  const current = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (current !== serialized) {
    console.error("skill-paths.generated.json is stale — run `npm run quests:build`");
    process.exit(1);
  }
  console.log(`skill paths up to date (${paths.length} paths)`);
} else {
  writeFileSync(OUT, serialized);
  console.log(`Wrote ${paths.length} paths (${paths.length * 3} quests) to skill-paths.generated.json`);
}

/*
 * Coverage report: a goal with nothing to do is a broken quest board.
 *
 * Counted over the catalogue the app actually serves, which is these paths
 * plus the hand-written ones in skill-paths.ts — checking only the derived
 * half would report QA Engineer as empty when test automation covers it.
 */
function parseAuthored() {
  const src = readFileSync(join(ROOT, "apps/web/lib/skill-paths.ts"), "utf8");
  const body = src.slice(src.indexOf("const authoredSkills"), src.indexOf("const roadmapSkills"));
  // Goals live in skill-roles.ts for every path, so only the id is read here.
  return [...body.matchAll(/^ {2}(\w+): detailed\(/gm)].map((m) => ({
    skillId: m[1],
    goalRoles: goalRoles[m[1]] ?? [],
  }));
}

const authored = parseAuthored();
const served = [...paths.filter((p) => !authored.some((a) => a.skillId === p.skillId)), ...authored];
console.log(`Catalogue: ${served.length} paths (${paths.length} roadmap-derived, ${authored.length} authored)`);

const perGoal = new Map(ALL_GOALS.map((g) => [g, 0]));
for (const path of served) for (const role of path.goalRoles) perGoal.set(role, (perGoal.get(role) ?? 0) + 1);
const thin = [...perGoal].filter(([, n]) => n < 4);
console.log([...perGoal].map(([g, n]) => `  ${String(n).padStart(3)}  ${g}`).join("\n"));
if (thin.length) {
  console.error("Goals with fewer than 4 paths: " + thin.map(([g]) => g).join(", "));
  process.exit(1);
}
