#!/usr/bin/env node
/**
 * CampusQuest dataset generator
 * ---------------------------------------------------------------------------
 * Emits the fourteen CSV-backed tables described in the data-foundation
 * document. Deterministic: the same seed always produces byte-identical files,
 * so a figure quoted in the write-up can be re-derived rather than trusted.
 *
 *   node scripts/generate-campus-dataset.mjs [--seed 31] [--out <dir>]
 *
 * Requirements are sampled from per-family skill probability profiles rather
 * than assigned uniformly. That is the whole reason the dataset is usable:
 * uniform assignment makes every aggregate converge to the same percentage, so
 * no skill gap is more urgent than another and every query returns a flat
 * answer. Profiles produce clustering, a realistic near-miss population, and
 * gaps worth ranking.
 *
 * Integrity rules enforced here:
 *  - every skill_id in student_skills / job_requirements / opportunity_skills
 *    resolves to a row in skills — one vocabulary, no orphans
 *  - every role belongs to a real company
 *  - every research project sits in an area its professor actually publishes in
 *  - every opportunity's domain matches its title
 *  - placement history exists only for fourth-year students, and only against
 *    roles in their target family
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AREA_DEPARTMENTS, BRANCHES, COMPANY_NAMES, FIRST_NAMES, LAST_NAMES, LOCATIONS,
  OPPORTUNITY_TITLES, OPPORTUNITY_TYPES, ORGANIZATIONS, RESEARCH_AREAS,
  RESOURCE_PROVIDERS, ROLE_FAMILIES, SKILLS, sk,
} from "./dataset/vocabulary.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const argValue = (flag, fallback) => {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const SEED = Number(argValue("--seed", "31"));
const OUT_DIR = join(root, argValue("--out", "databricks/seed/data"));

/* ----------------------------------------------------------------- random -- */

/** mulberry32: small, fast, and identical across Node versions. */
function makeRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(SEED);
const chance = (p) => random() < p;
const pick = (list) => list[Math.floor(random() * list.length)];
const range = (min, max) => min + Math.floor(random() * (max - min + 1));
const round2 = (n) => Math.round(n * 100) / 100;

/** Pick `count` distinct members, deterministically. */
function sample(list, count) {
  const pool = [...list];
  const out = [];
  for (let i = 0; i < count && pool.length; i += 1) {
    out.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  }
  return out;
}

/* -------------------------------------------------------------------- csv -- */

function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const tables = {};
function emit(name, columns, rows) {
  tables[name] = { columns, rows };
  const body = [columns.join(","), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(","))];
  writeFileSync(join(OUT_DIR, `${name}.csv`), `${body.join("\n")}\n`, "utf8");
}

mkdirSync(OUT_DIR, { recursive: true });

/* ----------------------------------------------------------------- tables -- */

// 1. skills — the join hub. Student skills, job requirements and opportunity
//    requirements all reference these ids, which is what makes a single query
//    able to cross from "what a student knows" to "what roles wanted".
emit("skills", ["skill_id", "slug", "name", "category"], SKILLS);

// 2. companies
const companies = COMPANY_NAMES.map((name, index) => ({
  company_id: `C${String(index + 1).padStart(3, "0")}`,
  name,
  sector: ["Fintech", "E-commerce", "SaaS", "AI", "IT Services", "Deep Tech"][index % 6],
  tier: index < 10 ? "product" : index < 20 ? "growth" : "service",
  campus_recruiter: chance(0.8),
}));
emit("companies", ["company_id", "name", "sector", "tier", "campus_recruiter"], companies);

// 3. students — 221. Target roles come from the same family vocabulary the
//    roles use, so alignment is computable for every student.
const FAMILIES = ROLE_FAMILIES.map((f) => f.family);
const students = [];
const usedNames = new Set();
for (let i = 0; i < 221; i += 1) {
  let name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  let guard = 0;
  while (usedNames.has(name) && guard++ < 50) name = `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`;
  usedNames.add(name);
  students.push({
    student_id: `S${String(i).padStart(4, "0")}`,
    name,
    branch: pick(BRANCHES),
    year: range(1, 4),
    cgpa: round2(6 + random() * 3.5),
    target_role: pick(FAMILIES),
  });
}
emit("students", ["student_id", "name", "branch", "year", "cgpa", "target_role"], students);

// 4. job_roles — 205 across eleven families, distributed by the counts in the
//    vocabulary so backend + software engineering together stay near a fifth
//    of the population.
const jobRoles = [];
let roleCounter = 0;
for (const { family, roles } of ROLE_FAMILIES) {
  for (let i = 0; i < roles; i += 1) {
    jobRoles.push({
      role_id: `R${String(roleCounter++).padStart(4, "0")}`,
      company_id: pick(companies).company_id,
      role_family: family,
      year: range(2022, 2026),
      location: pick(LOCATIONS),
    });
  }
}
emit("job_roles", ["role_id", "company_id", "role_family", "year", "location"], jobRoles);

// 5. job_requirements — sampled per role from its family profile. A skill above
//    the core threshold is a hard requirement (weight 2 in alignment); the rest
//    are preferred (weight 1). Every role keeps at least three requirements so
//    no role is trivially satisfied.
const CORE_THRESHOLD = 0.45;
const profileByFamily = new Map(ROLE_FAMILIES.map((f) => [f.family, f.profile]));
const jobRequirements = [];
for (const role of jobRoles) {
  const profile = profileByFamily.get(role.role_family);
  const entries = Object.entries(profile);
  let drawn = entries.filter(([, p]) => chance(p));
  // A thin draw is re-rolled rather than topped up from the head of the
  // profile. Injecting the highest-probability skills whenever sampling comes
  // up short is precisely what drives one skill to appear in every role and
  // makes the whole dataset read as fabricated.
  for (let attempt = 0; drawn.length < 3 && attempt < 12; attempt += 1) {
    drawn = entries.filter(([, p]) => chance(p));
  }
  if (drawn.length < 3) {
    // Still short after re-rolling: fill from anywhere in the profile at
    // random, with no preference for the head.
    for (const entry of sample(entries, 3 - drawn.length)) {
      if (!drawn.some(([name]) => name === entry[0])) drawn.push(entry);
    }
  }
  for (const [name, p] of drawn) {
    jobRequirements.push({
      role_id: role.role_id,
      skill_id: sk(name),
      importance: p >= CORE_THRESHOLD ? "core" : "preferred",
    });
  }
}
emit("job_requirements", ["role_id", "skill_id", "importance"], jobRequirements);

// 6. student_skills — drawn from the profile of the student's target role at
//    reduced probability, plus noise. That produces a realistic near-miss
//    population: students who nearly match their target and have a small,
//    rankable set of gaps.
const studentSkills = [];
for (const student of students) {
  const profile = profileByFamily.get(student.target_role);
  // Seniors have had longer to accumulate skills.
  const attenuation = 0.64 + student.year * 0.085;
  const held = new Set();
  for (const [name, p] of Object.entries(profile)) {
    if (chance(p * attenuation)) held.add(name);
  }
  // Noise: a little breadth outside the target profile.
  for (const skill of sample(SKILLS, range(0, 2))) {
    if (!held.has(skill.name)) held.add(skill.name);
  }
  for (const name of held) {
    studentSkills.push({
      student_id: student.student_id,
      skill_id: sk(name),
      proficiency: ["beginner", "intermediate", "advanced"][Math.min(2, range(0, 2))],
    });
  }
}
emit("student_skills", ["student_id", "skill_id", "proficiency"], studentSkills);

// 7. placement_history — one outcome per historical role, and only for
//    fourth-year students whose target family matches the role.
const finalYearByFamily = new Map();
for (const student of students.filter((s) => s.year === 4)) {
  if (!finalYearByFamily.has(student.target_role)) finalYearByFamily.set(student.target_role, []);
  finalYearByFamily.get(student.target_role).push(student);
}
const placementHistory = jobRoles.map((role, index) => {
  const cohort = finalYearByFamily.get(role.role_family) ?? [];
  const student = cohort.length ? cohort[index % cohort.length] : null;
  const placed = chance(0.62);
  return {
    placement_id: `P${String(index).padStart(4, "0")}`,
    student_id: student ? student.student_id : "",
    role_id: role.role_id,
    company_id: role.company_id,
    year: role.year,
    outcome: placed ? "placed" : "not_placed",
    package_lpa: placed ? round2(6 + random() * 24) : "",
  };
});
emit("placement_history",
  ["placement_id", "student_id", "role_id", "company_id", "year", "outcome", "package_lpa"],
  placementHistory);

// 8. opportunities — 80. The title pool is keyed by domain, so an
//    opportunity's domain always matches its title.
const DOMAINS = Object.keys(OPPORTUNITY_TITLES);
const opportunities = [];
for (let i = 0; i < 80; i += 1) {
  const domain = DOMAINS[i % DOMAINS.length];
  const titles = OPPORTUNITY_TITLES[domain];
  const title = titles[Math.floor(i / DOMAINS.length) % titles.length];
  const month = range(9, 12);
  opportunities.push({
    opportunity_id: `O${String(i + 1).padStart(3, "0")}`,
    title,
    organization: pick(ORGANIZATIONS),
    type: title.match(/Hackathon/) ? "hackathon"
      : title.match(/Workshop|Clinic|Bootcamp|Camp|Primer|Intensive|Sprint/) ? "workshop"
      : title.match(/Competition|Regionals/) ? "competition"
      : title.match(/Assistantship|Research/) ? "research"
      : "internship",
    domain,
    deadline: `2026-${String(month).padStart(2, "0")}-${String(range(1, 28)).padStart(2, "0")}`,
    difficulty: pick(["intro", "intermediate", "advanced"]),
  });
}
emit("opportunities",
  ["opportunity_id", "title", "organization", "type", "domain", "deadline", "difficulty"],
  opportunities);

// 9. opportunity_skills — what an opportunity actually teaches, drawn from the
//    families whose work matches its domain. This is what lets the Radar rank
//    by the historical frequency of the gaps an opportunity closes.
const DOMAIN_FAMILIES = {
  Backend: ["Backend Engineer"], Frontend: ["Frontend Engineer"],
  Data: ["Data Engineer", "Data Analyst"], "Machine Learning": ["ML Engineer"],
  DevOps: ["DevOps Engineer"], Robotics: ["ML Engineer", "Embedded Engineer"],
  Algorithms: ["Software Engineer", "Backend Engineer"], Mobile: ["Mobile Engineer"],
};
const opportunitySkills = [];
for (const opportunity of opportunities) {
  const pool = new Set();
  for (const family of DOMAIN_FAMILIES[opportunity.domain]) {
    for (const name of Object.keys(profileByFamily.get(family))) pool.add(name);
  }
  for (const name of sample([...pool], range(3, 4))) {
    opportunitySkills.push({ opportunity_id: opportunity.opportunity_id, skill_id: sk(name) });
  }
}
emit("opportunity_skills", ["opportunity_id", "skill_id"], opportunitySkills);

// 10. learning_resources — 60, one or more per skill, so every gap the app
//     surfaces can be answered with something concrete to do next.
const learningResources = [];
for (let i = 0; i < 60; i += 1) {
  const skill = SKILLS[i % SKILLS.length];
  learningResources.push({
    resource_id: `L${String(i + 1).padStart(3, "0")}`,
    title: `${["Introduction to", "Hands-on", "Applied", "Deep Dive:"][i % 4]} ${skill.name}`,
    provider: pick(RESOURCE_PROVIDERS),
    resource_type: pick(["course", "tutorial", "workshop", "book"]),
    skill_id: skill.skill_id,
    level: pick(["intro", "intermediate", "advanced"]),
    estimated_hours: range(4, 40),
    is_free: chance(0.7),
  });
}
emit("learning_resources",
  ["resource_id", "title", "provider", "resource_type", "skill_id", "level", "estimated_hours", "is_free"],
  learningResources);

// 11. professors — 25.
const professors = [];
for (let i = 0; i < 25; i += 1) {
  professors.push({
    professor_id: `F${String(i + 1).padStart(3, "0")}`,
    name: `Dr. ${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
    department: pick(BRANCHES),
    designation: pick(["Assistant Professor", "Associate Professor", "Professor"]),
    accepting_students: chance(0.6),
  });
}
emit("professors", ["professor_id", "name", "department", "designation", "accepting_students"], professors);

// 12. professor_research — the areas each professor works in, constrained to
//     areas their department plausibly hosts.
const professorAreas = new Map();
const professorResearch = [];
for (const professor of professors) {
  const plausible = RESEARCH_AREAS.filter((area) => AREA_DEPARTMENTS[area].includes(professor.department));
  const areas = sample(plausible.length ? plausible : RESEARCH_AREAS, Math.min(plausible.length || 1, range(2, 3)));
  professorAreas.set(professor.professor_id, areas);
  for (const area of areas) {
    professorResearch.push({ professor_id: professor.professor_id, research_area: area });
  }
}
emit("professor_research", ["professor_id", "research_area"], professorResearch);

// 13. research_projects — 42. A project's area is drawn from the areas its
//     professor publishes in, so the matchmaker can never return a computer
//     vision professor whose only open project is in bioinformatics.
const researchProjects = [];
for (let i = 0; i < 42; i += 1) {
  const professor = professors[i % professors.length];
  const area = pick(professorAreas.get(professor.professor_id));
  researchProjects.push({
    project_id: `RP${String(i + 1).padStart(3, "0")}`,
    professor_id: professor.professor_id,
    title: `${area} ${pick(["for Low-Resource Settings", "on Embedded Hardware", "at Campus Scale", "with Limited Supervision", "in Real-Time Systems"])}`,
    research_area: area,
    status: pick(["open", "open", "ongoing"]),
    open_positions: range(0, 3),
    year_started: range(2023, 2026),
  });
}
emit("research_projects",
  ["project_id", "professor_id", "title", "research_area", "status", "open_positions", "year_started"],
  researchProjects);

// 14. publications — 60, also confined to the professor's own areas.
const publications = [];
for (let i = 0; i < 60; i += 1) {
  const professor = professors[i % professors.length];
  const area = pick(professorAreas.get(professor.professor_id));
  publications.push({
    publication_id: `PB${String(i + 1).padStart(3, "0")}`,
    professor_id: professor.professor_id,
    title: `${pick(["Towards", "On", "Rethinking", "Efficient", "Robust"])} ${area} ${pick(["at Scale", "under Constraints", "for Campus Deployments", "with Weak Labels"])}`,
    venue: pick(["IEEE Access", "ACM TIST", "CVPR Workshops", "Springer LNCS", "Elsevier PMC", "NeurIPS Workshops"]),
    year: range(2022, 2026),
    research_area: area,
  });
}
emit("publications", ["publication_id", "professor_id", "title", "venue", "year", "research_area"], publications);

/* ------------------------------------------------------------------ report */

const total = Object.values(tables).reduce((sum, t) => sum + t.rows.length, 0);
console.log(`seed ${SEED} → ${OUT_DIR}\n`);
for (const [name, t] of Object.entries(tables)) {
  console.log(`  ${name.padEnd(22)} ${String(t.rows.length).padStart(5)}`);
}
console.log(`  ${"TOTAL".padEnd(22)} ${String(total).padStart(5)} rows across ${Object.keys(tables).length} tables`);

// The document's flagship aggregate, recomputed from what was just written, so
// a mismatch is visible at generation time rather than during the demo.
const targetRoles = new Set(jobRoles.filter((r) => ["Backend Engineer", "Software Engineer"].includes(r.role_family)).map((r) => r.role_id));
const counts = new Map();
for (const requirement of jobRequirements) {
  if (targetRoles.has(requirement.role_id)) {
    counts.set(requirement.skill_id, (counts.get(requirement.skill_id) ?? 0) + 1);
  }
}
const nameById = new Map(SKILLS.map((s) => [s.skill_id, s.name]));
console.log(`\nBackend + Software Engineer (${targetRoles.size} roles) — top requirements:`);
[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).forEach(([id, n]) => {
  console.log(`  ${nameById.get(id).padEnd(30)} ${String(n).padStart(3)}  ${Math.round((100 * n) / targetRoles.size)}%`);
});
