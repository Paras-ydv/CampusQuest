import type { ResearchMatch, ResearchProject, Skill } from "@campusquest/shared";
import { DEMO_RESEARCH } from "@/lib/data/fixtures";
import type { BackendProfile } from "@/lib/backend/profile";

type RawResearchProject = ResearchProject;
const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;

function configuredTable(name: string): string {
  const parts = (process.env[name] ?? "").split(".");
  if (parts.length !== 3 || parts.some((part) => !identifier.test(part))) throw new Error(`${name} must be a catalogue.schema.table identifier`);
  return parts.map((part) => `\`${part}\``).join(".");
}

function tokens(value: string): Set<string> { return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2)); }
function overlappingInterests(interests: string[], area: string, leadAreas: string[]): string[] {
  const target = new Set([area, ...leadAreas].flatMap((item) => [...tokens(item)]));
  return interests.filter((interest) => [...tokens(interest)].some((word) => target.has(word)));
}

export function scoreResearch(profile: Pick<BackendProfile, "interests" | "skills">, project: ResearchProject): { pct: number; viaInterests: string[] } {
  const viaInterests = overlappingInterests(profile.interests, project.area, project.lead.areas);
  const held = new Set(profile.skills.map((skill) => skill.id));
  const required = project.requiredSkills.length;
  const skillScore = required ? project.requiredSkills.filter((skill) => held.has(skill.id)).length / required : 1;
  const interestScore = viaInterests.length / Math.max(1, profile.interests.length);
  const score = interestScore * 0.5 + skillScore * 0.3 + (project.openings > 0 ? 1 : 0) * 0.1 + (project.lead.openToStudents ? 1 : 0) * 0.1;
  return { pct: Math.round(Math.min(100, score * 100)), viaInterests };
}

function parseJson(value: unknown, fallback: unknown): unknown {
  if (typeof value !== "string") return value ?? fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

function asProject(row: Record<string, unknown>): RawResearchProject {
  const requiredSkills = parseJson(row.required_skills, []) as Skill[];
  const publications = parseJson(row.publications, []) as ResearchProject["publications"];
  const areas = parseJson(row.lead_areas, []) as string[];
  return {
    id: String(row.id), title: String(row.title), summary: String(row.summary ?? ""), area: String(row.area), openings: Number(row.openings ?? 0),
    requiredSkills, publications,
    lead: { id: String(row.lead_id), name: String(row.lead_name), initials: String(row.lead_initials ?? String(row.lead_name).slice(0, 2).toUpperCase()).slice(0, 2), title: String(row.lead_title ?? "Research lead"), department: String(row.lead_department ?? ""), areas, openToStudents: Boolean(row.lead_open_to_students) },
  };
}

/** Minimal Databricks Statement Execution adapter. User data is never interpolated into SQL. */
export async function loadDatabricksResearchProjects(): Promise<RawResearchProject[] | null> {
  const host = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  const warehouseId = process.env.DATABRICKS_SQL_WAREHOUSE_ID;
  if (!host || !token || !warehouseId || !process.env.P4_RESEARCH_PROJECTS_TABLE) return null;
  const table = configuredTable("P4_RESEARCH_PROJECTS_TABLE");
  // P4 publishes this denormalised view with JSON `required_skills` and
  // `publications`; no request-derived values reach the statement text.
  const statement = `SELECT id, title, summary, area, openings, required_skills, publications, lead_id, lead_name, lead_initials, lead_title, lead_department, lead_areas, lead_open_to_students FROM ${table}`;
  const created = await fetch(`${host}/api/2.0/sql/statements`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ warehouse_id: warehouseId, statement, wait_timeout: "10s", disposition: "INLINE" }), cache: "no-store" });
  if (!created.ok) throw new Error(`Databricks research query failed (${created.status})`);
  let payload = await created.json() as { statement_id?: string; status?: { state?: string }; result?: { data_array?: unknown[][]; manifest?: { schema?: { columns?: { name: string }[] } } } };
  for (let attempt = 0; payload.status?.state === "PENDING" || payload.status?.state === "RUNNING"; attempt += 1) {
    if (!payload.statement_id || attempt > 12) throw new Error("Databricks research query timed out");
    await new Promise((resolve) => setTimeout(resolve, 250));
    const poll = await fetch(`${host}/api/2.0/sql/statements/${encodeURIComponent(payload.statement_id)}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!poll.ok) throw new Error(`Databricks research poll failed (${poll.status})`);
    payload = await poll.json() as typeof payload;
  }
  if (payload.status?.state !== "SUCCEEDED") throw new Error("Databricks research query did not succeed");
  const names = payload.result?.manifest?.schema?.columns?.map((column) => column.name) ?? [];
  return (payload.result?.data_array ?? []).map((values) => asProject(Object.fromEntries(names.map((name, index) => [name, values[index]]))));
}

export async function researchMatches(profile: Pick<BackendProfile, "interests" | "skills">): Promise<ResearchMatch[]> {
  let projects: RawResearchProject[] = DEMO_RESEARCH.map((match) => match.project);
  try { projects = (await loadDatabricksResearchProjects()) ?? projects; } catch { /* explicit seeded fallback keeps local development usable */ }
  return projects.map((project) => {
    const { pct, viaInterests } = scoreResearch(profile, project);
    const held = new Set(profile.skills.map((skill) => skill.id));
    const heldNames = project.requiredSkills.filter((skill) => held.has(skill.id)).map((skill) => skill.name);
    const openingText = project.openings > 0
      ? `${project.openings} ${project.openings === 1 ? "opening is" : "openings are"} available.`
      : "There are currently no openings.";
    const why = `${viaInterests.join(" and ") || project.area} aligns with this project${heldNames.length ? `, and you already hold ${heldNames.join(" and ")}` : ""}. ${openingText}`;
    return { project, matchPct: pct, viaInterests, why } satisfies ResearchMatch;
  }).sort((left, right) => right.matchPct - left.matchPct || left.project.title.localeCompare(right.project.title));
}
