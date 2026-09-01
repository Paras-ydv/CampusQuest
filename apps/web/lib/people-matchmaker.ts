import type { PeerMatch, PeopleQuery, Skill } from "@campusquest/shared";
import { DEMO_PEERS, DEMO_PROFILE } from "@/lib/data/fixtures";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { getOrCreateProfileEmbedding } from "@/lib/embeddings";
import { createAdminSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";
import { z } from "zod";

type Candidate = BackendProfile & { similarity: number; connection: PeerMatch["connection"] };
const RerankResponse = z.object({ matches: z.array(z.object({ id: z.string(), why: z.string().max(1000), rank: z.number().int().nonnegative().optional() })).max(100) });

function words(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
}
function overlaps(left: string[], right: string[]): string[] {
  const rightWords = new Set(right.flatMap((item) => [...words(item)]));
  return left.filter((item) => [...words(item)].some((word) => rightWords.has(word)));
}
function toSkill(skill: { id: string; name: string; category: string }): Skill {
  return { id: skill.id, name: skill.name, category: skill.category as Skill["category"] };
}

export function scorePeer(current: Pick<BackendProfile, "skills" | "interests" | "lookingForTeam">, candidate: Pick<Candidate, "skills" | "interests" | "lookingForTeam" | "similarity">): number {
  const mine = new Set(current.skills.map((skill) => skill.id));
  const theirs = new Set(candidate.skills.map((skill) => skill.id));
  const complementary = [...theirs].filter((skill) => !mine.has(skill)).length / Math.max(1, theirs.size);
  const common = overlaps(current.interests, candidate.interests).length / Math.max(1, Math.max(current.interests.length, candidate.interests.length));
  const vector = Math.max(0, Math.min(1, (candidate.similarity + 1) / 2));
  return Math.round(Math.min(100, (vector * 0.5 + complementary * 0.3 + common * 0.15 + (candidate.lookingForTeam ? 1 : 0) * 0.05) * 100));
}

function fallbackCandidates(): Candidate[] {
  return DEMO_PEERS.map((peer) => ({
    id: peer.id, name: peer.name, email: "", initials: peer.initials, branch: peer.branch, year: peer.year,
    goalRole: peer.goalRole, interests: peer.sharedInterests, wantsToLearn: [], collaborationIntent: peer.lookingFor,
    lookingForTeam: /team|partner|collaborator/i.test(peer.lookingFor), xp: 0, level: 1, alignmentPct: 0,
    skills: [...peer.complementarySkills, ...peer.youBring], projects: [], similarity: (peer.matchPct / 100) * 2 - 1, connection: peer.connection,
  }));
}

function matchesQuery(candidate: Candidate, query: PeopleQuery): boolean {
  if (query.interest && !candidate.interests.some((interest) => interest.toLowerCase().includes(query.interest!.toLowerCase()))) return false;
  if (query.skillId && !candidate.skills.some((skill) => skill.id === query.skillId)) return false;
  if (query.lookingForTeam && !candidate.lookingForTeam) return false;
  if (query.search && !`${candidate.name} ${candidate.goalRole} ${candidate.branch}`.toLowerCase().includes(query.search.toLowerCase())) return false;
  return true;
}

async function requestRerank(request: Request | undefined, current: BackendProfile, peers: PeerMatch[]): Promise<PeerMatch[]> {
  const endpoint = process.env.P2_GENIE_RATIONALE_URL;
  if (!endpoint || peers.length === 0) return peers;
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    // Server components call this without a Request. The rerank service is an
    // optional adapter, so forwarding no credentials simply means it declines
    // and the deterministic ordering stands.
    const authorization = request?.headers.get("authorization");
    const cookie = request?.headers.get("cookie");
    if (authorization) headers.Authorization = authorization;
    if (cookie) headers.Cookie = cookie;
    const response = await fetch(endpoint, { method: "POST", headers, body: JSON.stringify({ userId: current.id, candidates: peers.map(({ id, name, complementarySkills, sharedInterests }) => ({ id, name, complementarySkills: complementarySkills.map((skill) => skill.name), sharedInterests })) }), cache: "no-store" });
    if (!response.ok) return peers;
    const output = RerankResponse.safeParse(await response.json());
    if (!output.success) return peers;
    const byId = new Map(peers.map((peer) => [peer.id, peer]));
    const reranked = output.data.matches.flatMap((entry) => {
      const peer = byId.get(entry.id);
      if (!peer) return [];
      byId.delete(entry.id);
      return [{ ...peer, why: entry.why }];
    });
    return [...reranked, ...byId.values()];
  } catch { return peers; }
}

export async function peopleMatches(request: Request | undefined, userId: string, query: PeopleQuery): Promise<PeerMatch[]> {
  const current = await getBackendProfile(request, userId);
  const admin = createAdminSupabaseClient();
  let candidates: Candidate[];
  if (!admin) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for people matching");
    candidates = fallbackCandidates();
  } else {
    /**
     * Vector retrieval is an *enhancement* to matching, not a precondition for
     * it. Embeddings deliberately fail closed in production when no provider
     * is configured, which is correct for the vector itself — but letting that
     * take down the entire People screen is not. The score is
     * vector 0.5 / complementary skills 0.3 / shared interests 0.15 /
     * looking-for-team 0.05, so without vectors the other four still rank
     * candidates meaningfully.
     *
     * The fallback drops the vector term rather than substituting a fabricated
     * one: every candidate simply scores 0 on that component.
     */
    let vectorById = new Map<string, number>();
    try {
      const currentEmbedding = await getOrCreateProfileEmbedding({ userId: current.id, goalRole: current.goalRole, interests: current.interests, skills: current.skills, projects: current.projects, collaborationIntent: current.collaborationIntent });
      const { data: vectorRows, error: vectorError } = await admin.rpc("match_embeddings", { p_embedding: `[${currentEmbedding.embedding.join(",")}]`, p_entity_type: "profile", p_exclude_id: current.id, p_limit: 80 } as never);
      if (vectorError) throw new Error(vectorError.message);
      // A zero-norm stored vector makes pgvector's cosine distance NaN. Treat a
      // non-finite similarity as "no vector signal" so one degenerate row cannot
      // turn every score into NaN and fail the response schema.
      vectorById = new Map(((vectorRows ?? []) as unknown as { entity_id: string; similarity: number }[])
        .map((row) => {
          const similarity = Number(row.similarity);
          return [row.entity_id, Number.isFinite(similarity) ? similarity : 0] as const;
        }));
    } catch (error) {
      console.warn("[people] vector retrieval unavailable, ranking without it —", error instanceof Error ? error.message : error);
    }

    let ids = [...vectorById.keys()];
    if (!ids.length) {
      // No vector index to retrieve by: consider every other student instead.
      const { data: allProfiles, error: allError } = await admin.from("profiles").select("id").neq("id", current.id).limit(80);
      if (allError) throw new Error(`Could not load matching candidates: ${allError.message}`);
      ids = (allProfiles ?? []).map((row) => String(row.id));
    }
    if (!ids.length) return [];
    const [{ data: profiles, error: profilesError }, { data: skillRows, error: skillError }, { data: connections, error: connectionError }, { data: requests, error: requestError }] = await Promise.all([
      admin.from("profiles").select("*").in("id", ids),
      admin.from("user_skills").select("user_id, skills(id,name,category)").in("user_id", ids),
      admin.from("connections").select("user_a_id,user_b_id").or(`user_a_id.eq.${current.id},user_b_id.eq.${current.id}`),
      admin.from("connection_requests").select("requester_id,recipient_id,status").or(`requester_id.eq.${current.id},recipient_id.eq.${current.id}`),
    ]);
    if (profilesError || skillError || connectionError || requestError) throw new Error(`Could not load matching candidates: ${profilesError?.message ?? skillError?.message ?? connectionError?.message ?? requestError?.message}`);
    const skillsByUser = new Map<string, { id: string; name: string; category: string }[]>();
    for (const row of (skillRows ?? []) as unknown as { user_id: string; skills: { id: string; name: string; category: string } | null }[]) {
      if (row.skills) skillsByUser.set(row.user_id, [...(skillsByUser.get(row.user_id) ?? []), row.skills]);
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
      skills: skillsByUser.get(profile.id) ?? [], projects: [], similarity: vectorById.get(profile.id) ?? 0, connection: connectionById.get(profile.id) ?? "none",
    }));
  }
  const mine = new Set(current.skills.map((skill) => skill.id));
  const peers = candidates.filter((candidate) => candidate.id !== current.id && matchesQuery(candidate, query)).map((candidate) => {
    const complementarySkills = candidate.skills.filter((skill) => !mine.has(skill.id)).map(toSkill);
    const theirSkills = new Set(candidate.skills.map((skill) => skill.id));
    const youBring = current.skills.filter((skill) => !theirSkills.has(skill.id)).map(toSkill);
    const sharedInterests = overlaps(current.interests, candidate.interests);
    return {
      id: candidate.id, name: candidate.name, initials: candidate.initials, branch: candidate.branch, year: candidate.year as PeerMatch["year"], goalRole: candidate.goalRole,
      matchPct: scorePeer(current, candidate), sharedInterests, complementarySkills, youBring,
      lookingFor: candidate.collaborationIntent ?? "Open to complementary collaborators",
      why: `${candidate.name.split(" ")[0] ?? candidate.name} brings ${complementarySkills.slice(0, 2).map((skill) => skill.name).join(" and ") || "a complementary perspective"}; you share ${sharedInterests.join(" and ") || "a collaboration goal"}.`,
      connection: candidate.connection,
    } satisfies PeerMatch;
  }).sort((left, right) => right.matchPct - left.matchPct || left.name.localeCompare(right.name));
  return requestRerank(request, current, peers);
}
