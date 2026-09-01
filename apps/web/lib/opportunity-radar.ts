import type { Opportunity, OpportunityKind, OpportunityQuery, Skill } from "@campusquest/shared";
import { ALL_SKILLS } from "@/lib/data/skills";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { resolveRoleFamily } from "@/lib/data/role-families";
import { invalidateUser } from "@/lib/data/warehouse-cache";
import { analyticsTable, databricksSqlConfigured, executeDatabricksSql, parseSqlArray } from "@/lib/databricks/sql";
import { createRequestSupabaseClient, supabaseForCaller } from "@/lib/supabase/server";

/**
 * ===========================================================================
 *  OPPORTUNITY RADAR
 * ===========================================================================
 * Ranking is driven by placement evidence, not keyword overlap. An opportunity
 * scores by the historical weight of the gaps it closes for *this* student:
 * how often the roles in their target family asked for those skills, and how
 * much of the family's total requirement weight each one carries.
 *
 * Two opportunities that both teach "a skill you lack" are not equally useful,
 * and the difference is exactly what the warehouse can measure.
 */

const KIND_BY_TYPE: Record<string, OpportunityKind> = {
  internship: "internship", hackathon: "hackathon", workshop: "workshop",
  competition: "competition", research: "research",
};

function skillOf(id: string, name = id): Skill {
  return ALL_SKILLS.find((candidate) => candidate.id === id) ?? { id, name, category: "practice" };
}

/**
 * One query does the whole job: scope the student's role family, weight every
 * skill by how much of that family's requirement weight it carries, then join
 * opportunities to the subset of those skills the student does not hold.
 */
const radarSql = (
  roles: string, weights: string, skills: string, opportunities: string, opportunitySkills: string,
) => `
WITH scoped AS (
  SELECT role_id FROM ${roles} WHERE lower(role_family) = lower(:target_role)
), role_weight AS (
  SELECT w.role_id, sum(w.weight) AS total_weight
  FROM ${weights} w JOIN scoped s ON s.role_id = w.role_id GROUP BY w.role_id
), totals AS (
  SELECT count(*) AS role_count, sum(total_weight) AS family_weight FROM role_weight
), skill_evidence AS (
  SELECT sk.skill_id, sk.slug, sk.name,
         round(100.0 * count(DISTINCT w.role_id) / greatest(max(t.role_count), 1), 0) AS frequency_pct,
         round(100.0 * sum(w.weight) / greatest(max(t.family_weight), 1), 0) AS impact_pct
  FROM ${weights} w
  JOIN scoped s ON s.role_id = w.role_id
  JOIN ${skills} sk ON sk.skill_id = w.skill_id
  CROSS JOIN totals t
  GROUP BY sk.skill_id, sk.slug, sk.name
)
SELECT o.opportunity_id, o.title, o.organization, o.type, o.domain, o.deadline, o.difficulty,
       -- One delimited array rather than three parallel collect_list calls:
       -- Spark does not guarantee that separate collect_list aggregates emit
       -- their elements in the same order, so parallel arrays can misalign.
       collect_list(concat_ws(char(1), sk.slug, sk.name,
         CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), sk.slug) THEN '1' ELSE '0' END,
         cast(coalesce(e.impact_pct, 0) AS string),
         cast(coalesce(e.frequency_pct, 0) AS string))) AS skill_rows,
       -- Evidence score: total impact of the gaps this opportunity closes.
       sum(CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), sk.slug) THEN 0 ELSE coalesce(e.impact_pct, 0) END) AS gap_impact,
       sum(CASE WHEN array_contains(from_json(:held_skills, 'array<string>'), sk.slug) THEN 0 ELSE coalesce(e.frequency_pct, 0) END) AS gap_frequency,
       count(*) AS skill_count
FROM ${opportunities} o
JOIN ${opportunitySkills} os ON os.opportunity_id = o.opportunity_id
JOIN ${skills} sk ON sk.skill_id = os.skill_id
-- LEFT: a skill the target family never asks for still belongs on the card,
-- it simply carries no placement evidence. An inner join here silently drops
-- whole opportunities from the Radar.
LEFT JOIN skill_evidence e ON e.skill_id = sk.skill_id
GROUP BY o.opportunity_id, o.title, o.organization, o.type, o.domain, o.deadline, o.difficulty
ORDER BY gap_impact DESC, gap_frequency DESC, o.deadline, o.opportunity_id
LIMIT 200`;

/** Which opportunities this user has saved. Read from Supabase, not Databricks. */
async function savedIds(request: Request | undefined, userId: string): Promise<Set<string>> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return new Set();
  const { data } = await supabase.from("saved_opportunities").select("opportunity_id").eq("user_id", userId);
  return new Set((data ?? []).map((row) => String(row.opportunity_id)));
}

function toOpportunity(row: Record<string, unknown>, saved: Set<string>): Opportunity {
  const parsed = parseSqlArray(row.skill_rows).map((entry) => {
    const [slug, name, heldFlag, impact, frequency] = entry.split("\u0001");
    return { skill: skillOf(slug, name || slug), held: heldFlag === "1", impactPct: Number(impact) || 0, frequencyPct: Number(frequency) || 0 };
  });

  const closes = parsed.filter((item) => !item.held).map((item) => item.skill);
  const alreadyHeld = parsed.filter((item) => item.held).map((item) => item.skill);

  const skillCount = Number(row.skill_count) || 1;
  const gapImpact = Number(row.gap_impact) || 0;
  // Relevance blends "how much evidence backs the gaps it closes" with "how
  // much of it is new to you". Both terms come from the warehouse.
  const newShare = closes.length / skillCount;
  const matchPct = Math.max(0, Math.min(100, Math.round(gapImpact * 2.5 + newShare * 30)));

  const deadline = row.deadline ? String(row.deadline) : null;
  const id = String(row.opportunity_id);

  return {
    id,
    title: String(row.title),
    org: String(row.organization ?? "Campus"),
    kind: KIND_BY_TYPE[String(row.type)] ?? "event",
    description: `${String(row.domain)} · closes ${closes.length} of your ${String(row.domain).toLowerCase()} skill gaps.`,
    deadline: deadline ? new Date(`${deadline}T23:59:59.000Z`).toISOString() : null,
    // What it asks of you is what you already hold; what it teaches is the rest.
    requiredSkills: alreadyHeld,
    skillsGained: closes,
    difficulty: (["intro", "intermediate", "advanced"].includes(String(row.difficulty))
      ? String(row.difficulty) : "intermediate") as Opportunity["difficulty"],
    matchPct,
    closesGapIds: closes.map((item) => item.id),
    url: "",
    saved: saved.has(id),
    source: "Databricks · campusquest.opportunities",
  };
}

/** Filters applied server-side so the client never has to re-derive a score. */
function applyQuery(items: Opportunity[], query: OpportunityQuery, nowMs: number): Opportunity[] {
  return items.filter((item) => {
    if (query.kinds?.length && !query.kinds.includes(item.kind)) return false;
    if (query.difficulty && item.difficulty !== query.difficulty) return false;
    if (query.savedOnly && !item.saved) return false;
    if (query.closingWithinDays) {
      if (!item.deadline) return false;
      const days = (new Date(item.deadline).getTime() - nowMs) / 86_400_000;
      if (days < 0 || days > query.closingWithinDays) return false;
    }
    if (query.search) {
      const q = query.search.toLowerCase();
      const haystack = `${item.title} ${item.org} ${item.description} ${item.skillsGained.map((s) => s.name).join(" ")}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

export async function opportunityRadar(
  request: Request | undefined, userId: string, query: OpportunityQuery = {}, profileOverride?: BackendProfile,
): Promise<Opportunity[]> {
  if (!databricksSqlConfigured()) throw new Error("DATABRICKS_NOT_CONFIGURED");

  const profile = profileOverride ?? await getBackendProfile(request, userId);
  const heldIds = profile.skills.map((item) => item.id);
  const roleFamily = resolveRoleFamily(profile.goalRole);

  const [result, saved] = await Promise.all([
    executeDatabricksSql(
      radarSql(
        analyticsTable("job_roles"), analyticsTable("role_requirement_weight"), analyticsTable("skills"),
        analyticsTable("opportunities"), analyticsTable("opportunity_skills"),
      ),
      [
        { name: "target_role", value: roleFamily, type: "STRING" },
        { name: "held_skills", value: JSON.stringify(heldIds), type: "STRING" },
      ],
      200,
    ),
    savedIds(request, userId),
  ]);

  const rows = result.rows.map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])));
  const items = rows.map((row) => toOpportunity(row, saved));
  return applyQuery(items, query, Date.now());
}

/** Persisted through Supabase RLS, so a user can only save for themselves. */
export async function setOpportunitySaved(
  request: Request | undefined, userId: string, opportunityId: string, saved: boolean,
): Promise<{ opportunityId: string; saved: boolean }> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) throw new Error("SUPABASE_NOT_CONFIGURED");
  if (saved) {
    const { error } = await supabase
      .from("saved_opportunities")
      .upsert({ user_id: userId, opportunity_id: opportunityId }, { onConflict: "user_id,opportunity_id", ignoreDuplicates: true });
    if (error) throw new Error(`Could not save opportunity: ${error.message}`);
  } else {
    const { error } = await supabase
      .from("saved_opportunities").delete().eq("user_id", userId).eq("opportunity_id", opportunityId);
    if (error) throw new Error(`Could not unsave opportunity: ${error.message}`);
  }
  invalidateUser(userId);
  return { opportunityId, saved };
}
