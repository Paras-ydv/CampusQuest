import { DEMO_PROFILE } from "@/lib/data/fixtures";
import { createRequestSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

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

export async function getBackendProfile(request: Request, userId: string): Promise<BackendProfile> {
  const supabase = createRequestSupabaseClient(request);
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
