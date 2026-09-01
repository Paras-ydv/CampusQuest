import { SkillGap } from "@campusquest/shared";
import { DEMO_ALIGNMENT, DEMO_GAPS } from "@/lib/data/fixtures";

export type SkillGapContext = { gaps: { skillId: string; impactPct: number }[]; alignmentPct: number };

/** Adapter for P2. Its unavailable state has a stable, fixture-derived fallback. */
export async function getSkillGapContext(userId: string, wantsToLearn: string[], alignmentPct = DEMO_ALIGNMENT.currentPct): Promise<SkillGapContext> {
  const endpoint = process.env.P2_SKILL_GAP_URL;
  if (endpoint) {
    try {
      const response = await fetch(`${endpoint}${endpoint.includes("?") ? "&" : "?"}userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      if (response.ok) {
        const body: unknown = await response.json();
        const parsed = SkillGap.array().safeParse(Array.isArray(body) ? body : (body as { gaps?: unknown }).gaps);
        if (parsed.success) return { gaps: parsed.data.map((gap) => ({ skillId: gap.skill.id, impactPct: gap.impactPct })), alignmentPct: typeof (body as { currentPct?: unknown }).currentPct === "number" ? (body as { currentPct: number }).currentPct : alignmentPct };
      }
    } catch { /* P2 is optional; ranking remains deterministic. */ }
  }
  const requested = new Set(wantsToLearn);
  const gaps = DEMO_GAPS.filter((gap) => requested.size === 0 || requested.has(gap.skill.id)).map((gap) => ({ skillId: gap.skill.id, impactPct: gap.impactPct }));
  return { gaps, alignmentPct };
}
