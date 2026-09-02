import { cache } from "react";
import type {
  AlignmentResponse, ChatMessage, HistoricalRole, Opportunity,
  PeerMatch, Profile, Quest, ResearchMatch, Thread,
} from "@campusquest/shared";
import { requireUser } from "@/lib/auth/session";
import type { Badge } from "@/lib/badges";
import { listBadges } from "@/lib/badges";
import { getFullProfile } from "@/lib/backend/profile";
import { listMessages, listThreads, threadMemberDirectory } from "@/lib/chat";
import { listPendingRequests } from "@/lib/connection-requests";
import { opportunityRadar } from "@/lib/opportunity-radar";
import { peopleMatches } from "@/lib/people-matchmaker";
import { listQuests, nextQuest } from "@/lib/quest-engine";
import { researchMatches } from "@/lib/research-repository";
import { getAlignment, getHistoricalRoles } from "@/lib/timemachine";
import { getBackendProfile } from "@/lib/backend/profile";
import { cachedForUser } from "./warehouse-cache";
import { outlineForSkill } from "@/lib/roadmap/outlines";
import { roadmapWithProgress } from "@/lib/roadmap/progress";
import type { RoadmapLink } from "@/lib/roadmap/skill-map";
import type { RoadmapWithProgress } from "@campusquest/shared";

/** A roadmap plus how it was matched, so the UI can say "broader" out loud. */
export type SkillRoadmapView = RoadmapWithProgress & { link: RoadmapLink };

/**
 * ===========================================================================
 *  SERVER-SIDE READS
 * ===========================================================================
 * Server components used to fetch their own HTTP routes. On Vercel each of
 * those is a *separate serverless invocation* — the page function waits on a
 * network round trip to a second function that then queries Databricks. The
 * dashboard alone did six of them, which measured at three seconds of pure
 * overhead on top of the queries themselves.
 *
 * These call the same backend modules the route handlers call, in process.
 * The route handlers stay exactly as they were: client components, the Genie
 * panel and anything outside the server render still go over HTTP, and there
 * is only one implementation of each read either way.
 *
 * Passing `undefined` for the request is deliberate — with no request to read,
 * the Supabase client is built from the cookie store, which is what a server
 * component has.
 */

/** Deduplicates within a single render: two components asking for the profile cost one read. */
const currentUser = cache(async () => requireUser());

export const getProfile = cache(async (): Promise<Profile> => {
  const user = await currentUser();
  return cachedForUser(user.id, "profile", () => getFullProfile(undefined, user.id));
});

export const getBackendProfileCached = cache(async () => {
  const user = await currentUser();
  return cachedForUser(user.id, "backend-profile", () => getBackendProfile(undefined, user.id));
});

export const getAlignmentData = cache(async (targetRole?: string): Promise<AlignmentResponse> => {
  const user = await currentUser();
  return cachedForUser(user.id, "alignment" + (targetRole ?? ""), () => getAlignment(undefined, user.id, targetRole));
});

export const getHistoricalRolesData = cache(async (targetRole?: string): Promise<HistoricalRole[]> => {
  const user = await currentUser();
  return cachedForUser(user.id, "roles" + (targetRole ?? ""), () => getHistoricalRoles(undefined, user.id, targetRole));
});

export const getQuestsData = cache(async (): Promise<Quest[]> => {
  const user = await currentUser();
  return cachedForUser(user.id, "quests", () => listQuests(undefined, user.id));
});

export const getNextQuestData = cache(async (): Promise<Quest> => {
  const user = await currentUser();
  return cachedForUser(user.id, "next-quest", () => nextQuest(undefined, user.id));
});

export const getPeersData = cache(async (): Promise<PeerMatch[]> => {
  const user = await currentUser();
  return cachedForUser(user.id, "peers", () => peopleMatches(undefined, user.id, {}));
});

export const getPendingRequestsData = cache(async () => {
  const user = await currentUser();
  return listPendingRequests(undefined, user.id);
});

export const getOpportunitiesData = cache(async (): Promise<Opportunity[]> => {
  const user = await currentUser();
  return cachedForUser(user.id, "opportunities", () => opportunityRadar(undefined, user.id, {}));
});

export const getResearchData = cache(async (): Promise<ResearchMatch[]> => {
  const profile = await getBackendProfileCached();
  return cachedForUser(profile.id, "research", () => researchMatches(profile));
});

export const getBadgesData = cache(async (): Promise<Badge[]> => {
  const user = await currentUser();
  return cachedForUser(user.id, "badges", () => listBadges(undefined, user.id));
});

export const getThreadsData = cache(async (): Promise<Thread[]> => {
  const user = await currentUser();
  return listThreads(undefined, user.id);
});

/* --------------------------------------------------------------- Roadmap -- */

/**
 * The learning outline for a skill, with this student's ticks.
 *
 * Not put through `cachedForUser`: the outline is committed data already in
 * memory, and the progress read is a single indexed Supabase query. There is
 * nothing here worth a warehouse-shaped cache.
 */
export const getSkillRoadmap = cache(async (skillId: string): Promise<SkillRoadmapView | null> => {
  const found = await outlineForSkill(skillId);
  if (!found) return null;
  const user = await currentUser();
  return {
    link: found.link,
    ...(await roadmapWithProgress(undefined, user.id, found.outline)),
  };
});

export const getThreadMembersData = cache(async () => {
  const user = await currentUser();
  return threadMemberDirectory(undefined, user.id);
});

export async function getMessagesData(threadId: string): Promise<ChatMessage[]> {
  const user = await currentUser();
  return (await listMessages(undefined, user.id, threadId, null, 50)).items;
}
