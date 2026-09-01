import { SkillGap } from "@campusquest/shared";
import { DEMO_ALIGNMENT, DEMO_GAPS } from "@/lib/data/fixtures";
import type { BackendProfile } from "@/lib/backend/profile";
import { databricksSqlConfigured } from "@/lib/databricks/sql";
import { warehouseSkillGaps } from "@/lib/timemachine";

export type SkillGapContext = {
  gaps: { skillId: string; impactPct: number }[];
  alignmentPct: number;
};

/**
 * The gap evidence the quest engine ranks on.
 *
 * This used to filter a fixture list by the student's `wants_to_learn`, which
 * meant the "recommended next quest" was the same for everyone regardless of
 * what they actually knew. It now reads the same weighted gaps the Time
 * Machine shows, so the RPG layer and the career-intelligence layer are two
 * views of one calculation rather than two unrelated systems.
 *
 * P2's optional service still wins when configured; fixtures remain the
 * offline path only.
 */
export async function getSkillGapContext(
  profile: Pick<BackendProfile, "id" | "goalRole" | "skills" | "wantsToLearn" | "alignmentPct">,
  alignmentPct = profile.alignmentPct || DEMO_ALIGNMENT.currentPct,
): Promise<SkillGapContext> {
  const endpoint = process.env.P2_SKILL_GAP_URL;
  if (endpoint) {
    try {
      const response = await fetch(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}userId=${encodeURIComponent(profile.id)}`,
        { cache: "no-store" },
      );
      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = SkillGap.array().safeParse(Array.isArray(body) ? body : (body as { gaps?: unknown }).gaps);
        if (parsed.success) {
          return {
            gaps: parsed.data.map((gap) => ({ skillId: gap.skill.id, impactPct: gap.impactPct })),
            alignmentPct: typeof (body as { currentPct?: unknown }).currentPct === "number"
              ? (body as { currentPct: number }).currentPct : alignmentPct,
          };
        }
      }
    } catch { /* P2 is optional; ranking stays deterministic without it. */ }
  }

  if (databricksSqlConfigured()) {
    // An empty result is a real answer — a student with no gaps in their target
    // family has none. Substituting fixture gaps here would recommend quests
    // for skills they already hold.
    const gaps = await warehouseSkillGaps(profile as BackendProfile);
    return { gaps: gaps.map((gap) => ({ skillId: gap.skill.id, impactPct: gap.impactPct })), alignmentPct };
  }

  const requested = new Set(profile.wantsToLearn);
  return {
    gaps: DEMO_GAPS
      .filter((gap) => requested.size === 0 || requested.has(gap.skill.id))
      .map((gap) => ({ skillId: gap.skill.id, impactPct: gap.impactPct })),
    alignmentPct,
  };
}
