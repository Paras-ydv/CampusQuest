import { z } from "zod";
import { createRequestSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

/**
 * ===========================================================================
 *  BADGES
 * ===========================================================================
 * Deliberately small. Criteria are counted from data the app already writes —
 * completed quests, skills earned from quests, accepted connections, saved
 * opportunities — so a badge cannot be awarded for anything the student did
 * not actually do.
 *
 * `award` is idempotent and safe to call on every read: it inserts only what
 * is newly earned and never revokes.
 */

export const Badge = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  metric: z.enum(["quests_completed", "skills_earned", "connections", "opportunities_saved"]),
  threshold: z.number().int().positive(),
  /** Where the student currently stands against the threshold. */
  progress: z.number().int().nonnegative(),
  earned: z.boolean(),
  awardedAt: z.string().nullable().default(null),
});
export type Badge = z.infer<typeof Badge>;

type Counts = Record<Badge["metric"], number>;

async function countsFor(request: Request, userId: string): Promise<Counts> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) return { quests_completed: 0, skills_earned: 0, connections: 0, opportunities_saved: 0 };

  const [quests, connections, saved] = await Promise.all([
    supabase.from("user_quests").select("quest_id").eq("user_id", userId).eq("status", "completed"),
    supabase.from("connections").select("user_a_id").or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`),
    supabase.from("saved_opportunities").select("opportunity_id").eq("user_id", userId),
  ]);

  const completedIds = (quests.data ?? []).map((row) => String(row.quest_id));
  // Skills earned means skills attached to quests the student finished, not
  // every skill on the profile — self-declared skills are not achievements.
  let skillsEarned = 0;
  if (completedIds.length) {
    const { data } = await supabase.from("quest_skills").select("skill_id").in("quest_id", completedIds);
    skillsEarned = new Set((data ?? []).map((row) => String(row.skill_id))).size;
  }

  return {
    quests_completed: completedIds.length,
    skills_earned: skillsEarned,
    connections: (connections.data ?? []).length,
    opportunities_saved: (saved.data ?? []).length,
  };
}

/**
 * Evaluates every badge and persists any newly earned ones. Returns the full
 * catalogue with progress so the UI can show what is still locked and how far
 * away it is.
 */
export async function listBadges(request: Request, userId: string): Promise<Badge[]> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    return [];
  }

  const [{ data: catalogue, error }, { data: awarded }, counts] = await Promise.all([
    supabase.from("badges").select("id,name,description,metric,threshold,sort_order").order("sort_order"),
    supabase.from("user_badges").select("badge_id,awarded_at").eq("user_id", userId),
    countsFor(request, userId),
  ]);
  if (error) throw new Error(`Could not load badges: ${error.message}`);

  const awardedAt = new Map((awarded ?? []).map((row) => [String(row.badge_id), String(row.awarded_at)]));

  const rows = (catalogue ?? []).map((row) => {
    const metric = row.metric as Badge["metric"];
    const progress = counts[metric] ?? 0;
    const earned = progress >= row.threshold;
    return {
      id: String(row.id), name: String(row.name), description: String(row.description),
      metric, threshold: Number(row.threshold),
      progress: Math.min(progress, Number(row.threshold)),
      earned,
      awardedAt: awardedAt.get(String(row.id)) ?? null,
    } satisfies Badge;
  });

  // Persist anything newly crossed. Conflicts mean it was already awarded.
  const newlyEarned = rows.filter((badge) => badge.earned && !awardedAt.has(badge.id));
  if (newlyEarned.length) {
    await supabase
      .from("user_badges")
      .upsert(newlyEarned.map((badge) => ({ user_id: userId, badge_id: badge.id })),
              { onConflict: "user_id,badge_id", ignoreDuplicates: true });
    const now = new Date().toISOString();
    for (const badge of newlyEarned) badge.awardedAt = now;
  }

  return rows;
}
