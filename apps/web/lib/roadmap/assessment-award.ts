import type { AssessmentAward } from "@campusquest/shared";
import { invalidateUser } from "@/lib/data/warehouse-cache";
import { SKILLS } from "@/lib/data/skills";
import { supabaseForCaller } from "@/lib/supabase/server";
import { ASSESSMENT_XP } from "./assessment";
import { SKILL_ROADMAPS } from "./skill-map";

/**
 * ===========================================================================
 *  WHAT PASSING IS WORTH
 * ===========================================================================
 * A passed assessment adds the skill to the student's profile and awards
 * experience.
 *
 * The skill lands as `source: "self"`, not `quest` or `verified`. Ten
 * questions are a stronger claim than typing the skill into onboarding and a
 * much weaker one than a quest with a repository behind it, and `self` is the
 * honest end of that range with the vocabulary the schema has. An existing row
 * is never overwritten, so a skill already earned by quest cannot be demoted
 * by taking a quiz about it.
 *
 * Experience is written straight onto `profiles`, mirroring the level rule the
 * `complete_quest` function uses (`floor(xp / 350) + 1`). It does not go
 * through that function because that function is about a quest: it consumes a
 * `user_quests` row and files a `quest_completed` activity, and an assessment
 * is neither. The consequence is that a pass does not appear in the activity
 * feed, whose `activity_type` check constraint has no value for it — worth
 * knowing, and cheaper than a migration that widens the constraint for a feed
 * nobody reads yet.
 */

/**
 * The skill a slug is evidence for.
 *
 * Only an `exact` match qualifies. The skill map deliberately points several
 * skills at a broader roadmap — PyTorch at Machine Learning — and passing the
 * Machine Learning assessment says nothing about PyTorch. Returning null there
 * costs the student a skill they did not demonstrate.
 */
function skillForSlug(slug: string): { id: string; name: string } | null {
  for (const [skillId, link] of Object.entries(SKILL_ROADMAPS)) {
    if (link.slug !== slug || link.match !== "exact") continue;
    const skill = SKILLS[skillId as keyof typeof SKILLS];
    if (skill) return { id: skill.id, name: skill.name };
  }
  return null;
}

/**
 * Records a pass. Returns null when there is no database to record it in —
 * mock mode — so the caller can say the result stood but nothing was saved,
 * rather than claiming an award that does not exist.
 */
export async function awardAssessment(
  request: Request,
  userId: string,
  slug: string,
): Promise<AssessmentAward | null> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return null;

  const skill = skillForSlug(slug);
  let awardedSkill: { id: string; name: string } | null = null;

  if (skill) {
    // `ignoreDuplicates` is what protects a quest-earned row: the student
    // keeps the stronger source they already had.
    const { error } = await supabase
      .from("user_skills")
      .upsert(
        [{ user_id: userId, skill_id: skill.id, proficiency: "working", source: "self" }],
        { onConflict: "user_id,skill_id", ignoreDuplicates: true },
      );
    // A skill that will not save is not worth failing the whole result over —
    // the student still passed, and the experience below still lands.
    if (error) console.error("[assessment] could not save the skill —", error);
    else awardedSkill = skill;
  }

  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("xp, level")
    .eq("id", userId)
    .single();
  if (readError || !profile) throw new Error(`Could not read the profile: ${readError?.message ?? "no row"}`);

  const xp = Number(profile.xp) + ASSESSMENT_XP;
  // The same rule as complete_quest. Mirrored, not invented.
  const level = Math.floor(xp / 350) + 1;
  const { error: writeError } = await supabase
    .from("profiles")
    .update({ xp, level })
    .eq("id", userId);
  if (writeError) throw new Error(`Could not award experience: ${writeError.message}`);

  // Skills changed, so alignment, gaps, the recommended quest and the
  // opportunity ranking are all stale — the same invalidation a quest does.
  invalidateUser(userId);

  return {
    skillId: awardedSkill?.id ?? null,
    skillName: awardedSkill?.name ?? null,
    xpAwarded: ASSESSMENT_XP,
    xp,
    level,
    leveledUp: level > Number(profile.level),
  };
}
