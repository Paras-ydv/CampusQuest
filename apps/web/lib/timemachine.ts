import type { AlignmentResponse, HistoricalRole, SimulateInput, SimulateResponse, Skill, SkillGap } from "@campusquest/shared";
import { DEMO_ALIGNMENT, DEMO_ROLES } from "@/lib/data/fixtures";
import { ALL_SKILLS } from "@/lib/data/skills";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { databricksSqlConfigured, executeDatabricksSql } from "@/lib/databricks/sql";

const identifier = /^[A-Za-z_][A-Za-z0-9_]*$/;
function analyticsTable(name: string): string {
  const catalog = process.env.DATABRICKS_CATALOG ?? "main";
  const schema = process.env.DATABRICKS_SCHEMA ?? "campusquest";
  if (![catalog, schema, name].every((part) => identifier.test(part))) throw new Error("Databricks catalogue, schema, and table names must be safe identifiers");
  return `\`${catalog}\`.\`${schema}\`.\`${name}\``;
}
function skill(id: string, name = id): Skill {
  return ALL_SKILLS.find((candidate) => candidate.id === id) ?? { id, name, category: "practice" };
}
function years(rows: { year: number }[]): string {
  if (!rows.length) return "No historical data";
  const values = rows.map((row) => row.year).sort((a, b) => a - b);
  return values[0] === values.at(-1) ? String(values[0]) : `${values[0]}-${values.at(-1)}`;
}
function roleMatches(profile: BackendProfile, targetRole?: string): HistoricalRole[] {
  const held = new Set(profile.skills.map((item) => item.id));
  return DEMO_ROLES.filter((role) => !targetRole || role.title.toLowerCase().includes(targetRole.toLowerCase()) || profile.goalRole === targetRole)
    .map((role) => ({ ...role, matchPct: Math.round(100 * role.requiredSkills.filter((item) => held.has(item.id)).length / Math.max(1, role.requiredSkills.length)) }));
}
function fallbackAlignment(profile: BackendProfile, targetRole?: string): AlignmentResponse {
  const roles = roleMatches(profile, targetRole);
  const held = new Set(profile.skills.map((item) => item.id));
  const gaps: SkillGap[] = DEMO_ALIGNMENT.gaps.filter((gap) => !held.has(gap.skill.id));
  const currentPct = roles.length ? Math.round(roles.reduce((total, role) => total + role.matchPct, 0) / roles.length) : 0;
  return { currentPct, roleCount: roles.length, yearsCovered: years(roles), targetRole: targetRole ?? profile.goalRole, gaps, heldSkills: profile.skills.map((item) => skill(item.id, item.name)) };
}

const rolesSql = (jobs: string, required: string) => `
WITH scoped_jobs AS (
  SELECT job_id, title, company_name, posting_year
  FROM ${jobs}
  WHERE (:target_role = '' OR lower(role_family) = lower(:target_role))
), role_skills AS (
  SELECT j.job_id, j.title, j.company_name, j.posting_year,
         collect_set(r.skill_id) AS required_skill_ids,
         collect_set(r.skill_name) AS required_skill_names
  FROM scoped_jobs j JOIN ${required} r ON r.job_id = j.job_id
  GROUP BY j.job_id, j.title, j.company_name, j.posting_year
)
SELECT job_id, title, company_name, posting_year, required_skill_ids, required_skill_names,
       round(100.0 * size(array_intersect(required_skill_ids, from_json(:held_skills, 'array<string>'))) / greatest(size(required_skill_ids), 1), 0) AS match_pct
FROM role_skills ORDER BY posting_year DESC, title LIMIT 200`;

const gapsSql = (jobs: string, required: string) => `
WITH scoped_jobs AS (
  SELECT job_id FROM ${jobs} WHERE (:target_role = '' OR lower(role_family) = lower(:target_role))
), total AS (SELECT count(*) AS role_count FROM scoped_jobs)
SELECT r.skill_id, max(r.skill_name) AS skill_name,
       round(100.0 * count(DISTINCT r.job_id) / greatest(max(total.role_count), 1), 0) AS frequency_pct,
       round(100.0 * count(DISTINCT r.job_id) / greatest(max(total.role_count), 1), 0) AS impact_pct,
       max(total.role_count) AS role_count
FROM ${required} r JOIN scoped_jobs j ON j.job_id = r.job_id CROSS JOIN total
WHERE NOT array_contains(from_json(:held_skills, 'array<string>'), r.skill_id)
GROUP BY r.skill_id HAVING max(total.role_count) > 0 ORDER BY impact_pct DESC, r.skill_id LIMIT 20`;

function mappedRows(result: Awaited<ReturnType<typeof executeDatabricksSql>>): Record<string, unknown>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
}

async function warehouseAlignment(profile: BackendProfile, targetRole?: string): Promise<{ alignment: AlignmentResponse; roles: HistoricalRole[] }> {
  const heldIds = profile.skills.map((item) => item.id);
  const parameters = [{ name: "target_role", value: targetRole ?? profile.goalRole, type: "STRING" }, { name: "held_skills", value: JSON.stringify(heldIds), type: "STRING" }];
  const [roleResult, gapResult] = await Promise.all([
    executeDatabricksSql(rolesSql(analyticsTable("job_postings"), analyticsTable("job_required_skills")), parameters, 200),
    executeDatabricksSql(gapsSql(analyticsTable("job_postings"), analyticsTable("job_required_skills")), parameters, 20),
  ]);
  const roles = mappedRows(roleResult).map((row) => {
    const ids = Array.isArray(row.required_skill_ids) ? row.required_skill_ids : [];
    const names = Array.isArray(row.required_skill_names) ? row.required_skill_names : [];
    return { id: String(row.job_id), title: String(row.title), company: String(row.company_name), year: Number(row.posting_year), requiredSkills: ids.map((id, index) => skill(String(id), String(names[index] ?? id))), matchPct: Number(row.match_pct) } satisfies HistoricalRole;
  });
  const gaps = mappedRows(gapResult).map((row) => ({ skill: skill(String(row.skill_id), String(row.skill_name)), frequencyPct: Number(row.frequency_pct), impactPct: Number(row.impact_pct), roleCount: Number(row.role_count) } satisfies SkillGap));
  return { roles, alignment: { currentPct: roles.length ? Math.round(roles.reduce((sum, role) => sum + role.matchPct, 0) / roles.length) : 0, roleCount: roles.length, yearsCovered: years(roles), targetRole: targetRole ?? profile.goalRole, gaps, heldSkills: profile.skills.map((item) => skill(item.id, item.name)) } };
}

export async function getAlignment(request: Request, userId: string, targetRole?: string): Promise<AlignmentResponse> {
  const profile = await getBackendProfile(request, userId);
  if (!databricksSqlConfigured()) return fallbackAlignment(profile, targetRole);
  return (await warehouseAlignment(profile, targetRole)).alignment;
}
export async function getHistoricalRoles(request: Request, userId: string, targetRole?: string): Promise<HistoricalRole[]> {
  const profile = await getBackendProfile(request, userId);
  if (!databricksSqlConfigured()) return roleMatches(profile, targetRole);
  return (await warehouseAlignment(profile, targetRole)).roles;
}
export async function simulateTimeMachine(request: Request, userId: string, input: SimulateInput): Promise<SimulateResponse> {
  const profile = await getBackendProfile(request, userId);
  const before = await getAlignment(request, userId, input.targetRole);
  const existing = new Set(profile.skills.map((item) => item.id));
  const addedSkills = input.skillIds.filter((id) => !existing.has(id)).map((id) => skill(id));
  const simulated: BackendProfile = { ...profile, skills: [...profile.skills, ...addedSkills.map((item) => ({ id: item.id, name: item.name, category: item.category }))] };
  if (!databricksSqlConfigured()) {
    const beforeRoles = roleMatches(profile, input.targetRole);
    const afterRoles = roleMatches(simulated, input.targetRole);
    const unlocked = afterRoles.filter((role, index) => role.matchPct > (beforeRoles[index]?.matchPct ?? 0));
    const gain = before.gaps.filter((gap) => input.skillIds.includes(gap.skill.id)).reduce((sum, gap) => sum + gap.impactPct, 0);
    return { fromPct: before.currentPct, toPct: Math.min(100, before.currentPct + gain), addedSkills, unlockedRoleCount: unlocked.length, unlockedRoleTitles: unlocked.slice(0, 5).map((role) => role.title), unlockedOpportunityCount: 0 };
  }
  const after = (await warehouseAlignment(simulated, input.targetRole)).alignment;
  const beforeRoles = await getHistoricalRoles(request, userId, input.targetRole);
  const afterRoles = (await warehouseAlignment(simulated, input.targetRole)).roles;
  const unlocked = afterRoles.filter((role) => role.matchPct > (beforeRoles.find((prior) => prior.id === role.id)?.matchPct ?? 0));
  return { fromPct: before.currentPct, toPct: after.currentPct, addedSkills, unlockedRoleCount: unlocked.length, unlockedRoleTitles: unlocked.slice(0, 5).map((role) => role.title), unlockedOpportunityCount: 0 };
}
