import type { AlignmentResponse, HistoricalRole, SimulateInput, SimulateResponse, Skill, SkillGap } from "@campusquest/shared";
import { DEMO_ALIGNMENT, DEMO_ROLES } from "@/lib/data/fixtures";
import { ALL_SKILLS } from "@/lib/data/skills";
import { cache } from "react";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { resolveRoleFamily } from "@/lib/data/role-families";
import { analyticsTable, databricksSqlConfigured, executeDatabricksSql, parseSqlArray } from "@/lib/databricks/sql";

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
    .map((role) => {
      const matchPct = Math.round(100 * role.requiredSkills.filter((item) => held.has(item.id)).length / Math.max(1, role.requiredSkills.length));
      return { ...role, coreSkills: role.requiredSkills, matchPct, aligned: matchPct >= 50 };
    });
}
function fallbackAlignment(profile: BackendProfile, targetRole?: string): AlignmentResponse {
  const roles = roleMatches(profile, targetRole);
  const held = new Set(profile.skills.map((item) => item.id));
  const gaps: SkillGap[] = DEMO_ALIGNMENT.gaps.filter((gap) => !held.has(gap.skill.id));
  const currentPct = roles.length ? Math.round(roles.reduce((total, role) => total + role.matchPct, 0) / roles.length) : 0;
  return {
    currentPct, roleCount: roles.length,
    alignedRoleCount: roles.filter((role) => role.matchPct >= 50).length,
    yearsCovered: years(roles), targetRole: targetRole ?? profile.goalRole,
    roleFamily: resolveRoleFamily(targetRole ?? profile.goalRole),
    gaps, heldSkills: profile.skills.map((item) => skill(item.id, item.name)),
  };
}

/**
 * ===========================================================================
 *  THE ALIGNMENT RULE
 * ===========================================================================
 * Weighted coverage: a core skill counts double a preferred one, and a profile
 * aligns with a role when it holds at least 50% of that role's requirement
 * weight.
 *
 * An earlier version read only the required-skill list and treated every skill
 * equally. Under that rule, learning a skill that roles list as *preferred*
 * moved alignment by exactly zero — so the product's central question ("what
 * if I learn Docker?") silently did nothing. Any change here should be checked
 * against a preferred-only skill before it ships.
 *
 * `role_alignment` in the warehouse applies the same rule, but it joins the
 * warehouse's own `students` table. The application's user lives in Supabase,
 * so the held-skill set arrives as a parameter instead.
 */
const rolesSql = (roles: string, companies: string, weights: string) => `
WITH scoped AS (
  SELECT j.role_id, j.role_family, c.name AS company_name, j.year
  FROM ${roles} j JOIN ${companies} c ON c.company_id = j.company_id
  WHERE (:target_role = '' OR lower(j.role_family) = lower(:target_role))
), weighted AS (
  SELECT s.role_id, s.role_family, s.company_name, s.year,
         w.skill_slug, w.skill_name, w.importance, w.weight
  FROM scoped s JOIN ${weights} w ON w.role_id = s.role_id
)
SELECT role_id, role_family, company_name, year,
       collect_list(skill_slug) AS skill_slugs,
       collect_list(skill_name) AS skill_names,
       collect_list(importance) AS importances,
       sum(weight) AS total_weight,
       sum(CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), skill_slug) THEN weight ELSE 0 END) AS held_weight,
       round(100.0 * sum(CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), skill_slug) THEN weight ELSE 0 END)
             / greatest(sum(weight), 1), 0) AS match_pct,
       (sum(CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), skill_slug) THEN weight ELSE 0 END)
        >= 0.5 * sum(weight)) AS aligned
FROM weighted
GROUP BY role_id, role_family, company_name, year
ORDER BY match_pct DESC, year DESC, role_id
LIMIT 200`;

/**
 * `frequency_pct` is how often the family asked for the skill; `impact_pct` is
 * the share of the family's total requirement weight this one skill carries,
 * i.e. the mean alignment the student would gain by learning it. They differ,
 * which is what makes ranking by impact meaningful.
 *
 * The join to `learning_resources` turns "you are missing Docker" into
 * something the student can actually do next.
 */
const gapsSql = (roles: string, weights: string, resources: string, skills: string) => `
WITH scoped AS (
  SELECT role_id FROM ${roles}
  WHERE (:target_role = '' OR lower(role_family) = lower(:target_role))
), role_weight AS (
  SELECT w.role_id, sum(w.weight) AS total_weight
  FROM ${weights} w JOIN scoped s ON s.role_id = w.role_id
  GROUP BY w.role_id
), totals AS (
  SELECT count(*) AS role_count, sum(total_weight) AS family_weight FROM role_weight
), best_resource AS (
  SELECT skill_id, resource_id, title, provider, resource_type, level, estimated_hours, is_free
  FROM (
    SELECT r.*, row_number() OVER (
      PARTITION BY r.skill_id
      ORDER BY CASE r.level WHEN 'intro' THEN 0 WHEN 'intermediate' THEN 1 ELSE 2 END,
               CASE WHEN r.is_free THEN 0 ELSE 1 END, r.estimated_hours, r.resource_id
    ) AS rank
    FROM ${resources} r
  ) WHERE rank = 1
)
SELECT sk.slug AS skill_id, max(sk.name) AS skill_name,
       round(100.0 * count(DISTINCT w.role_id) / greatest(max(t.role_count), 1), 0) AS frequency_pct,
       round(100.0 * sum(w.weight) / greatest(max(t.family_weight), 1), 0) AS impact_pct,
       max(t.role_count) AS role_count,
       CASE WHEN max(CASE WHEN w.importance = 'core' THEN 1 ELSE 0 END) = 1 THEN 'core' ELSE 'preferred' END AS importance,
       max(br.resource_id) AS resource_id, max(br.title) AS resource_title,
       max(br.provider) AS resource_provider, max(br.resource_type) AS resource_type,
       max(br.level) AS resource_level, max(br.estimated_hours) AS resource_hours,
       max(CASE WHEN br.is_free THEN 1 ELSE 0 END) AS resource_free
FROM ${weights} w
JOIN scoped s ON s.role_id = w.role_id
JOIN ${skills} sk ON sk.skill_id = w.skill_id
CROSS JOIN totals t
LEFT JOIN best_resource br ON br.skill_id = w.skill_id
WHERE NOT array_contains(from_json(:held_skills, 'array<string>'), sk.slug)
GROUP BY sk.slug
HAVING max(t.role_count) > 0
ORDER BY impact_pct DESC, frequency_pct DESC, skill_id
LIMIT 20`;

function mappedRows(result: Awaited<ReturnType<typeof executeDatabricksSql>>): Record<string, unknown>[] {
  return result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
}

/**
 * Both warehouse queries are memoized for the lifetime of one request, keyed on
 * the two values that determine their result. `/journey` renders the Time
 * Machine alignment and the next quest together, and the quest engine ranks on
 * the same gap evidence the alignment already fetched — so the identical gap
 * statement was being sent to the warehouse twice, at roughly a second each.
 *
 * The key is the parameter values rather than the parameter array, because the
 * two call sites build separate arrays holding the same contents. Simulations
 * pass a different held-skill set and so still get their own query.
 */
const runRolesQuery = cache((targetRole: string, heldSkills: string) =>
  executeDatabricksSql(
    rolesSql(analyticsTable("job_roles"), analyticsTable("companies"), analyticsTable("role_requirement_weight")),
    sqlParameters(targetRole, heldSkills), 200,
  ),
);

function sqlParameters(targetRole: string, heldSkills: string) {
  return [
    { name: "target_role", value: targetRole, type: "STRING" },
    { name: "held_skills", value: heldSkills, type: "STRING" },
  ];
}

/**
 * The gap list, on its own. The quest engine ranks against exactly the same
 * evidence the Time Machine displays, so "your biggest gap is Docker" and
 * "your next quest is Dockerize a backend project" can never disagree.
 */
const runGapQuery = cache(async (targetRole: string, heldSkills: string): Promise<SkillGap[]> => {
  const result = await executeDatabricksSql(
    gapsSql(analyticsTable("job_roles"), analyticsTable("role_requirement_weight"), analyticsTable("learning_resources"), analyticsTable("skills")),
    sqlParameters(targetRole, heldSkills), 20,
  );
  return mappedRows(result).map((row) => ({
    skill: skill(String(row.skill_id), String(row.skill_name)),
    frequencyPct: Number(row.frequency_pct),
    impactPct: Number(row.impact_pct),
    roleCount: Number(row.role_count),
    importance: row.importance === "preferred" ? "preferred" : "core",
    resource: row.resource_id
      ? {
          id: String(row.resource_id),
          title: String(row.resource_title),
          provider: String(row.resource_provider ?? ""),
          resourceType: String(row.resource_type ?? "course"),
          level: String(row.resource_level ?? "intro"),
          estimatedHours: row.resource_hours === null || row.resource_hours === undefined ? null : Number(row.resource_hours),
          isFree: Number(row.resource_free) === 1,
          // The resource catalogue carries no links; inventing one would be a
          // fabricated fact on a card that claims to be evidence-based.
          url: null,
        }
      : null,
  } satisfies SkillGap));
});

/**
 * Measured weighted coverage for a profile, with no gap query. Quest
 * completion reports alignment before and after; deriving "after" by adding
 * the gained skill's impact to the stored column produced a number that
 * disagreed with the Time Machine on the very next screen.
 */
export async function warehouseCoveragePct(profile: BackendProfile, targetRole?: string): Promise<number | null> {
  if (!databricksSqlConfigured()) return null;
  const result = await runRolesQuery(
    resolveRoleFamily(targetRole ?? profile.goalRole),
    JSON.stringify(profile.skills.map((item) => item.id)),
  );
  const rows = mappedRows(result);
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + Number(row.held_weight) / Math.max(Number(row.total_weight), 1), 0);
  return Math.round((100 * total) / rows.length);
}

/** The student's real, evidence-ranked gaps for their goal role. */
export async function warehouseSkillGaps(profile: BackendProfile, targetRole?: string): Promise<SkillGap[]> {
  if (!databricksSqlConfigured()) return [];
  return runGapQuery(
    resolveRoleFamily(targetRole ?? profile.goalRole),
    JSON.stringify(profile.skills.map((item) => item.id)),
  );
}

async function warehouseAlignment(profile: BackendProfile, targetRole?: string, withGaps = true): Promise<{ alignment: AlignmentResponse; roles: HistoricalRole[] }> {
  const heldIds = profile.skills.map((item) => item.id);
  // The warehouse can only answer for its own role families, so whatever the
  // student typed or picked is resolved to one first.
  const roleFamily = resolveRoleFamily(targetRole ?? profile.goalRole);
  const heldSkills = JSON.stringify(heldIds);
  const [roleResult, gaps] = await Promise.all([
    runRolesQuery(roleFamily, heldSkills),
    // Skipped entirely when the caller only wants the role list: the gap query
    // is a second round trip to the warehouse and /api/timemachine/roles has no
    // use for its result.
    withGaps ? runGapQuery(roleFamily, heldSkills) : Promise.resolve([] as SkillGap[]),
  ]);

  const rows = mappedRows(roleResult);
  // Mean coverage is computed from the raw weights, not from the rounded
  // per-role percentages: averaging rounded values drifts from the same
  // aggregate run directly in SQL, and the headline number has to reconcile.
  const coverage = rows.map((row) => Number(row.held_weight) / Math.max(Number(row.total_weight), 1));

  const roles = rows.map((row) => {
    const slugs = parseSqlArray(row.skill_slugs);
    const names = parseSqlArray(row.skill_names);
    const importances = parseSqlArray(row.importances);
    const requiredSkills = slugs.map((id, index) => skill(id, names[index] ?? id));
    return {
      id: String(row.role_id),
      title: String(row.role_family),
      company: String(row.company_name),
      year: Number(row.year),
      requiredSkills,
      coreSkills: requiredSkills.filter((_, index) => importances[index] === "core"),
      matchPct: Number(row.match_pct),
      aligned: row.aligned === true || row.aligned === "true",
    } satisfies HistoricalRole;
  });

  const alignedRoleCount = roles.filter((role) => role.aligned).length;
  return {
    roles,
    alignment: {
      currentPct: coverage.length ? Math.round((100 * coverage.reduce((sum, value) => sum + value, 0)) / coverage.length) : 0,
      roleCount: roles.length,
      alignedRoleCount,
      yearsCovered: years(roles),
      targetRole: targetRole ?? profile.goalRole,
      roleFamily,
      gaps,
      heldSkills: profile.skills.map((item) => skill(item.id, item.name)),
    },
  };
}

export async function getAlignment(request: Request, userId: string, targetRole?: string): Promise<AlignmentResponse> {
  const profile = await getBackendProfile(request, userId);
  if (!databricksSqlConfigured()) return fallbackAlignment(profile, targetRole);
  return (await warehouseAlignment(profile, targetRole)).alignment;
}
export async function getHistoricalRoles(request: Request, userId: string, targetRole?: string): Promise<HistoricalRole[]> {
  const profile = await getBackendProfile(request, userId);
  if (!databricksSqlConfigured()) return roleMatches(profile, targetRole);
  return (await warehouseAlignment(profile, targetRole, false)).roles;
}
/**
 * How many open opportunities teach at least one of the newly added skills.
 * A real count from `opportunity_skills`, not a placeholder zero.
 */
async function unlockedOpportunityCount(addedIds: string[]): Promise<number> {
  if (!addedIds.length || !databricksSqlConfigured()) return 0;
  try {
    const result = await executeDatabricksSql(
      `SELECT count(DISTINCT os.opportunity_id) AS n
       FROM ${analyticsTable("opportunity_skills")} os
       JOIN ${analyticsTable("skills")} sk ON sk.skill_id = os.skill_id
       WHERE array_contains(from_json(:added_skills, 'array<string>'), sk.slug)`,
      [{ name: "added_skills", value: JSON.stringify(addedIds), type: "STRING" }],
      1,
    );
    return Number(result.rows[0]?.[0] ?? 0);
  } catch {
    // A failed count must not take down the whole simulation.
    return 0;
  }
}

export async function simulateTimeMachine(request: Request, userId: string, input: SimulateInput): Promise<SimulateResponse> {
  const profile = await getBackendProfile(request, userId);
  const existing = new Set(profile.skills.map((item) => item.id));
  const addedSkills = input.skillIds.filter((id) => !existing.has(id)).map((id) => skill(id));
  const simulated: BackendProfile = {
    ...profile,
    skills: [...profile.skills, ...addedSkills.map((item) => ({ id: item.id, name: item.name, category: item.category }))],
  };

  if (!databricksSqlConfigured()) {
    const before = fallbackAlignment(profile, input.targetRole);
    const beforeRoles = roleMatches(profile, input.targetRole);
    const afterRoles = roleMatches(simulated, input.targetRole);
    const unlocked = afterRoles.filter((role) => role.aligned && !beforeRoles.find((prior) => prior.id === role.id)?.aligned);
    const gain = before.gaps.filter((gap) => input.skillIds.includes(gap.skill.id)).reduce((sum, gap) => sum + gap.impactPct, 0);
    return {
      fromPct: before.currentPct, toPct: Math.min(100, before.currentPct + gain), addedSkills,
      unlockedRoleCount: unlocked.length,
      unlockedRoleTitles: unlocked.slice(0, 5).map((role) => `${role.title} — ${role.company}`),
      unlockedOpportunityCount: 0,
      fromAlignedRoleCount: beforeRoles.filter((role) => role.aligned).length,
      toAlignedRoleCount: afterRoles.filter((role) => role.aligned).length,
    };
  }

  // Both sides are computed with the same weighted rule, so the difference is
  // attributable to the added skills alone.
  const [beforeState, afterState] = await Promise.all([
    warehouseAlignment(profile, input.targetRole, false),
    warehouseAlignment(simulated, input.targetRole, false),
  ]);
  const alignedBefore = new Map(beforeState.roles.map((role) => [role.id, role.aligned]));
  // "Unlocked" means the role crossed the 50% alignment bar, not merely that
  // its percentage moved — a role going from 20% to 30% is not a new match.
  const unlocked = afterState.roles.filter((role) => role.aligned && !alignedBefore.get(role.id));

  return {
    fromPct: beforeState.alignment.currentPct,
    toPct: afterState.alignment.currentPct,
    addedSkills,
    unlockedRoleCount: unlocked.length,
    // Role families repeat across companies, so the company disambiguates.
    unlockedRoleTitles: [...new Set(unlocked.map((role) => `${role.title} — ${role.company}`))].slice(0, 5),
    unlockedOpportunityCount: await unlockedOpportunityCount(addedSkills.map((item) => item.id)),
    fromAlignedRoleCount: beforeState.alignment.alignedRoleCount,
    toAlignedRoleCount: afterState.alignment.alignedRoleCount,
  };
}
