import { OnboardingInput, Profile, UpdateProfileInput } from "@campusquest/shared";
import type { Database } from "@campusquest/db-types";
import { DEMO_PROFILE } from "@/lib/data/fixtures";
import { ALL_SKILLS } from "@/lib/data/skills";
import { invalidateUser } from "@/lib/data/warehouse-cache";
import { createRequestSupabaseClient, localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";

export type BackendProfile = {
  id: string;
  name: string;
  email: string;
  initials: string;
  branch: string;
  year: number;
  goalRole: string;
  interests: string[];
  wantsToLearn: string[];
  collaborationIntent: string | null;
  lookingForTeam: boolean;
  xp: number;
  level: number;
  alignmentPct: number;
  skills: { id: string; name: string; category: string }[];
  projects: { title: string; summary: string }[];
};

export function demoBackendProfile(userId = DEMO_PROFILE.id): BackendProfile {
  return {
    id: userId,
    name: DEMO_PROFILE.name, email: DEMO_PROFILE.email, initials: DEMO_PROFILE.initials,
    branch: DEMO_PROFILE.branch, year: DEMO_PROFILE.year, goalRole: DEMO_PROFILE.goalRole,
    interests: DEMO_PROFILE.interests, wantsToLearn: DEMO_PROFILE.wantsToLearn,
    collaborationIntent: "Hackathon and research collaborators", lookingForTeam: true,
    xp: DEMO_PROFILE.xp, level: DEMO_PROFILE.level, alignmentPct: DEMO_PROFILE.alignmentPct,
    skills: DEMO_PROFILE.skills.map(({ skill }) => skill),
    projects: DEMO_PROFILE.projects.map(({ title, summary }) => ({ title, summary })),
  };
}

export async function getBackendProfile(request: Request | undefined, userId: string): Promise<BackendProfile> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (localFallbackEnabled()) return demoBackendProfile(userId);
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }
  const { data: profile, error: profileError } = await supabase.from("profiles").select("*").eq("id", userId).single();
  if (profileError || !profile) throw new Error(profileError?.code === "PGRST116" ? "NOT_FOUND" : `Could not load profile: ${profileError?.message ?? "unknown error"}`);
  const [{ data: skillRows, error: skillsError }, { data: projects, error: projectsError }] = await Promise.all([
    supabase.from("user_skills").select("skill_id, skills(id,name,category)").eq("user_id", userId),
    supabase.from("user_projects").select("title,summary").eq("user_id", userId),
  ]);
  if (skillsError || projectsError) throw new Error(`Could not load profile details: ${skillsError?.message ?? projectsError?.message}`);
  const skills = ((skillRows ?? []) as unknown as { skills: { id: string; name: string; category: string } | null }[])
    .flatMap((row) => row.skills ? [row.skills] : []);
  return {
    id: profile.id, name: profile.name, email: profile.email, initials: profile.initials, branch: profile.branch,
    year: profile.academic_year, goalRole: profile.goal_role, interests: profile.interests,
    wantsToLearn: profile.wants_to_learn, collaborationIntent: profile.collaboration_intent,
    lookingForTeam: profile.looking_for_team, xp: profile.xp, level: profile.level,
    alignmentPct: Number(profile.alignment_pct), skills, projects: projects ?? [],
  };
}

/* ------------------------------------------------------ shared Profile -- */

/**
 * The XP rule is fixed in SQL (`level = floor(xp / 350) + 1`). Mirroring the
 * constant here is only for `xpToNext`; the level itself always comes from the
 * database column, never from this file.
 */
const XP_PER_LEVEL = 350;

/**
 * Reads the full `Profile` the shared schema describes — the shape every screen
 * already expects. `getBackendProfile` above stays as it is because the quest
 * engine and matchmaker read it, and they do not need projects or
 * certifications.
 */
export async function getFullProfile(request: Request | undefined, userId: string): Promise<Profile> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (localFallbackEnabled()) return DEMO_PROFILE;
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const [profileResult, skillsResult, projectsResult, certificationsResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_skills").select("proficiency, source, skills(id,name,category)").eq("user_id", userId),
    supabase.from("user_projects").select("id,title,summary,skill_ids,url").eq("user_id", userId),
    supabase.from("user_certifications").select("id,title,issuer,earned_at").eq("user_id", userId),
  ]);

  const profile = profileResult.data;
  if (profileResult.error || !profile) {
    throw new Error(profileResult.error?.code === "PGRST116" ? "NOT_FOUND" : `Could not load profile: ${profileResult.error?.message ?? "unknown error"}`);
  }

  const skillRows = (skillsResult.data ?? []) as unknown as {
    proficiency: string;
    source: string;
    skills: { id: string; name: string; category: string } | null;
  }[];

  return Profile.parse({
    id: profile.id,
    name: profile.name,
    email: profile.email,
    initials: profile.initials,
    branch: profile.branch,
    year: profile.academic_year,
    goalRole: profile.goal_role,
    interests: profile.interests,
    wantsToLearn: profile.wants_to_learn,
    skills: skillRows.flatMap((row) =>
      row.skills ? [{ skill: row.skills, proficiency: row.proficiency, source: row.source }] : [],
    ),
    projects: (projectsResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      skillIds: row.skill_ids,
      url: row.url,
    })),
    certifications: (certificationsResult.data ?? []).map((row) => ({
      id: row.id,
      title: row.title,
      issuer: row.issuer,
      earnedAt: row.earned_at,
    })),
    level: profile.level,
    xp: profile.xp,
    // The XP total that reaches the next level, not the remainder.
    xpToNext: profile.level * XP_PER_LEVEL,
    alignmentPct: Number(profile.alignment_pct),
    createdAt: profile.created_at,
  });
}

/* ------------------------------------------------------------- writes -- */

/** Two-letter monogram, matching the `char_length(initials) = 2` constraint. */
function initialsFor(name: string): string {
  const letters = name.replace(/[^a-zA-Z]/g, "");
  return (letters.slice(0, 2) || "XX").toUpperCase().padEnd(2, "X");
}

/**
 * Mock-mode stand-in: merges the submitted fields into the demo profile so the
 * UI still reflects what was just typed when no database is configured.
 */
function mergeIntoDemoProfile(input: Partial<OnboardingInput>): Profile {
  return Profile.parse({
    ...DEMO_PROFILE,
    name: input.name ?? DEMO_PROFILE.name,
    initials: input.name ? initialsFor(input.name) : DEMO_PROFILE.initials,
    branch: input.branch ?? DEMO_PROFILE.branch,
    year: input.year ?? DEMO_PROFILE.year,
    goalRole: input.goalRole ?? DEMO_PROFILE.goalRole,
    interests: input.interests ?? DEMO_PROFILE.interests,
    skills: input.skillIds
      ? input.skillIds.flatMap((id) => {
          const match = ALL_SKILLS.find((s) => s.id === id);
          return match ? [{ skill: match, proficiency: "working" as const, source: "self" as const }] : [];
        })
      : DEMO_PROFILE.skills,
  });
}

export async function updateProfile(
  request: Request | undefined,
  userId: string,
  input: UpdateProfileInput,
): Promise<Profile> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (localFallbackEnabled()) return mergeIntoDemoProfile(input);
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  // Only send columns the caller actually supplied; the input is partial.
  // `updated_at` is deliberately absent: the migration grants `authenticated`
  // column-level UPDATE on profiles covering only the user-editable fields, so
  // touching any other column fails the whole statement with "permission
  // denied for table profiles".
  const patch: Database["public"]["Tables"]["profiles"]["Update"] = {};
  if (input.name !== undefined) {
    patch.name = input.name;
    patch.initials = initialsFor(input.name);
  }
  if (input.branch !== undefined) patch.branch = input.branch;
  if (input.year !== undefined) patch.academic_year = input.year;
  if (input.goalRole !== undefined) patch.goal_role = input.goalRole;
  if (input.interests !== undefined) patch.interests = input.interests;

  // A fully empty PATCH is a no-op, not an error.
  if (Object.keys(patch).length) {
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(`Could not update profile: ${error.message}`);
    invalidateUser(userId);
  }
  return getFullProfile(request, userId);
}

/**
 * What the onboarding flow submits when the student finishes all five steps.
 * The profile row already exists (the signup trigger creates it), so this fills
 * in the fields the identity provider could not supply.
 */
export async function applyOnboarding(
  request: Request | undefined,
  userId: string,
  input: OnboardingInput,
): Promise<Profile> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (localFallbackEnabled()) return mergeIntoDemoProfile(input);
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      name: input.name,
      initials: initialsFor(input.name),
      branch: input.branch,
      academic_year: input.year,
      goal_role: input.goalRole,
      interests: input.interests,
    })
    .eq("id", userId);
  if (profileError) throw new Error(`Could not save onboarding: ${profileError.message}`);

  if (input.skillIds.length) {
    // Self-declared at onboarding; quests are what later upgrade a skill's
    // source to something more trustworthy. Re-running onboarding must not
    // downgrade a skill already earned, so existing rows are left alone.
    const { error: skillsError } = await supabase
      .from("user_skills")
      .upsert(
        input.skillIds.map((skillId) => ({
          user_id: userId,
          skill_id: skillId,
          proficiency: "working",
          source: "self",
        })),
        { onConflict: "user_id,skill_id", ignoreDuplicates: true },
      );
    if (skillsError) throw new Error(`Could not save skills: ${skillsError.message}`);
  }

  invalidateUser(userId);
  return getFullProfile(request, userId);
}
