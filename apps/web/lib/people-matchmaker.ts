import type { PeerMatch, PeopleQuery, Skill } from "@campusquest/shared";
import { DEMO_PEERS } from "@/lib/data/fixtures";
import { getBackendProfile, type BackendProfile, type BackendSkill } from "@/lib/backend/profile";
import { createAdminSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

type Candidate = BackendProfile & { connection: PeerMatch["connection"] };

const MIN_MATCH_SCORE = 25;
const proficiencyWeight = { learning: 0.5, working: 0.75, strong: 1 } as const;

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
}

function overlaps(left: string[], right: string[]): string[] {
  const rightWords = new Set(right.flatMap((item) => [...words(item)]));
  return left.filter((item) => [...words(item)].some((word) => rightWords.has(word)));
}

function toSkill(skill: BackendSkill): Skill {
  return { id: skill.id, name: skill.name, category: skill.category as Skill["category"] };
}

/** A transparent score based entirely on structured profile data. */
export function scorePeer(
  current: Pick<BackendProfile, "skills" | "interests" | "wantsToLearn">,
  candidate: Pick<Candidate, "skills" | "interests" | "lookingForTeam">,
): number {
  const mine = new Set(current.skills.map((skill) => skill.id));
  const theirs = new Set(candidate.skills.map((skill) => skill.id));
  const complementary = candidate.skills.filter((skill) => !mine.has(skill.id));
  if (!complementary.length) return 0;

  const totalCandidateStrength = candidate.skills.reduce((total, skill) => total + proficiencyWeight[skill.proficiency], 0);
  const complementaryStrength = complementary.reduce((total, skill) => total + proficiencyWeight[skill.proficiency], 0);
  const explicitGaps = current.wantsToLearn.filter((skillId) => !mine.has(skillId));
  const priorityCovered = explicitGaps.filter((skillId) => theirs.has(skillId)).length;
  const reciprocal = current.skills.filter((skill) => !theirs.has(skill.id)).length;
  const sharedInterests = overlaps(current.interests, candidate.interests).length;

  const complementScore = (complementaryStrength / Math.max(1, totalCandidateStrength)) * 55;
  const priorityScore = explicitGaps.length ? (priorityCovered / explicitGaps.length) * 20 : 0;
  const reciprocalScore = (reciprocal / Math.max(1, current.skills.length)) * 10;
  const interestScore = (sharedInterests / Math.max(1, Math.max(current.interests.length, candidate.interests.length))) * 10;
  return Math.round(Math.min(100, complementScore + priorityScore + reciprocalScore + interestScore + (candidate.lookingForTeam ? 5 : 0)));
}

function fallbackCandidates(): Candidate[] {
  return DEMO_PEERS.map((peer) => ({
    id: peer.id, name: peer.name, email: "", initials: peer.initials, branch: peer.branch, year: peer.year,
    goalRole: peer.goalRole, interests: peer.sharedInterests, wantsToLearn: [], collaborationIntent: peer.lookingFor,
    lookingForTeam: /team|partner|collaborator/i.test(peer.lookingFor), xp: 0, level: 1, alignmentPct: 0,
    skills: [
      ...peer.complementarySkills.map((skill) => ({ ...skill, proficiency: "strong" as const, source: "self" as const })),
      ...peer.youBring.map((skill) => ({ ...skill, proficiency: "working" as const, source: "self" as const })),
    ],
    projects: [], connection: peer.connection,
  }));
}

function matchesQuery(candidate: Candidate, query: PeopleQuery): boolean {
  if (query.interest && !candidate.interests.some((interest) => interest.toLowerCase().includes(query.interest!.toLowerCase()))) return false;
  if (query.skillId && !candidate.skills.some((skill) => skill.id === query.skillId)) return false;
  if (query.lookingForTeam && !candidate.lookingForTeam) return false;
  if (query.search && !`${candidate.name} ${candidate.goalRole} ${candidate.branch}`.toLowerCase().includes(query.search.toLowerCase())) return false;
  return true;
}

export async function peopleMatches(request: Request | undefined, userId: string, query: PeopleQuery): Promise<PeerMatch[]> {
  const current = await getBackendProfile(request, userId);
  const admin = createAdminSupabaseClient();
  let candidates: Candidate[];

  if (!admin) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for people matching");
    candidates = fallbackCandidates();
  } else {
    const [{ data: profiles, error: profilesError }, { data: skillRows, error: skillError }, { data: connections, error: connectionError }, { data: requests, error: requestError }] = await Promise.all([
      admin.from("profiles").select("*").neq("id", current.id).limit(80),
      admin.from("user_skills").select("user_id,proficiency,source,skills(id,name,category)").neq("user_id", current.id),
      admin.from("connections").select("user_a_id,user_b_id").or(`user_a_id.eq.${current.id},user_b_id.eq.${current.id}`),
      admin.from("connection_requests").select("requester_id,recipient_id,status").or(`requester_id.eq.${current.id},recipient_id.eq.${current.id}`),
    ]);
    if (profilesError || skillError || connectionError || requestError) throw new Error(`Could not load matching candidates: ${profilesError?.message ?? skillError?.message ?? connectionError?.message ?? requestError?.message}`);

    const skillsByUser = new Map<string, BackendSkill[]>();
    for (const row of (skillRows ?? []) as unknown as { user_id: string; proficiency: BackendSkill["proficiency"]; source: BackendSkill["source"]; skills: Omit<BackendSkill, "proficiency" | "source"> | null }[]) {
      if (row.skills) skillsByUser.set(row.user_id, [...(skillsByUser.get(row.user_id) ?? []), { ...row.skills, proficiency: row.proficiency, source: row.source }]);
    }
    const connectionById = new Map<string, PeerMatch["connection"]>();
    for (const connection of connections ?? []) connectionById.set(connection.user_a_id === current.id ? connection.user_b_id : connection.user_a_id, "connected");
    for (const item of requests ?? []) {
      const peerId = item.requester_id === current.id ? item.recipient_id : item.requester_id;
      if (item.status === "pending" && !connectionById.has(peerId)) connectionById.set(peerId, item.requester_id === current.id ? "outgoing" : "incoming");
    }
    candidates = (profiles ?? []).map((profile) => ({
      id: profile.id, name: profile.name, email: profile.email, initials: profile.initials, branch: profile.branch, year: profile.academic_year,
      goalRole: profile.goal_role, interests: profile.interests, wantsToLearn: profile.wants_to_learn, collaborationIntent: profile.collaboration_intent,
      lookingForTeam: profile.looking_for_team, xp: profile.xp, level: profile.level, alignmentPct: Number(profile.alignment_pct),
      skills: skillsByUser.get(profile.id) ?? [], projects: [], connection: connectionById.get(profile.id) ?? "none",
    }));
  }

  const mine = new Set(current.skills.map((skill) => skill.id));
  const priorityGaps = new Set(current.wantsToLearn.filter((skillId) => !mine.has(skillId)));
  return candidates
    .filter((candidate) => candidate.id !== current.id && matchesQuery(candidate, query))
    .map((candidate) => {
      const complementary = candidate.skills.filter((skill) => !mine.has(skill.id)).sort((left, right) =>
        Number(priorityGaps.has(right.id)) - Number(priorityGaps.has(left.id)) || proficiencyWeight[right.proficiency] - proficiencyWeight[left.proficiency] || left.name.localeCompare(right.name),
      );
      const theirSkills = new Set(candidate.skills.map((skill) => skill.id));
      const youBring = current.skills.filter((skill) => !theirSkills.has(skill.id)).map(toSkill);
      const sharedInterests = overlaps(current.interests, candidate.interests);
      const matchPct = scorePeer(current, candidate);
      const prioritySkills = complementary.filter((skill) => priorityGaps.has(skill.id));
      const leadSkills = (prioritySkills.length ? prioritySkills : complementary).slice(0, 2).map((skill) => skill.name);
      return {
        id: candidate.id, name: candidate.name, email: candidate.email, initials: candidate.initials, branch: candidate.branch, year: candidate.year as PeerMatch["year"], goalRole: candidate.goalRole,
        matchPct, sharedInterests, complementarySkills: complementary.map(toSkill), youBring,
        lookingFor: candidate.collaborationIntent ?? "Open to complementary collaborators",
        why: `${candidate.name.split(" ")[0] ?? candidate.name} can cover ${leadSkills.join(" and ")}; ${prioritySkills.length ? "these are skills you want to learn" : "these complement your current profile"}.`,
        connection: candidate.connection,
      } satisfies PeerMatch;
    })
    .filter((peer) => peer.complementarySkills.length > 0 && peer.matchPct >= MIN_MATCH_SCORE)
    .sort((left, right) => right.matchPct - left.matchPct || left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
}
