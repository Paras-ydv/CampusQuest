import { cache } from "react";
import { headers } from "next/headers";
import {
  Opportunity,
  OpportunityQuery,
  MessagePage,
  PeerMatch,
  PeopleQuery,
  Profile,
  Quest,
  ResearchMatch,
  Thread,
  type AlignmentResponse,
  type HistoricalRole,
} from "@campusquest/shared";

import { requireUser } from "@/lib/auth/session";
import { Badge, listBadges } from "@/lib/badges";
import { getBackendProfile, getFullProfile } from "@/lib/backend/profile";
import { listMessages, listThreads } from "@/lib/chat";
import { opportunityRadar } from "@/lib/opportunity-radar";
import { peopleMatches } from "@/lib/people-matchmaker";
import { listQuests, nextQuest } from "@/lib/quest-engine";
import { researchMatches } from "@/lib/research-repository";
import {
  getAlignment as alignmentFor,
  getHistoricalRoles as historicalRolesFor,
} from "@/lib/timemachine";

/**
 * ===========================================================================
 *  THE SERVER-SIDE READ PATH
 * ===========================================================================
 * The mirror of `lib/data/client.ts`, for Server Components only.
 *
 * The client module reaches the backend by fetching this app's own route
 * handlers over the loopback interface. That is the right transport from a
 * browser and the wrong one from a Server Component: rendering `/journey` fired
 * six loopback requests, and each one paid for a TCP hop, a `proxy.ts` session
 * refresh and a second `requireUser()` — twelve `supabase.auth.getUser()` round
 * trips, measured at roughly 200ms each, for a session the renderer had already
 * resolved.
 *
 * Every function here calls exactly what the matching route handler calls, with
 * the same arguments and the same schema parse, so the value a page receives is
 * the one it received over HTTP. What disappears is the HTTP.
 *
 * The browser still goes through `client.ts`; the route handlers it talks to
 * are unchanged.
 */

/**
 * The backend reads the caller's Supabase token off a `Request`
 * (`createRequestSupabaseClient`), and a Server Component has no request object
 * to give it. This rebuilds one carrying the same two headers `apiFetch`
 * forwarded across the loopback hop, so the backend sees the input it has
 * always seen.
 *
 * Memoized because `getBackendProfile` is memoized on its arguments: one
 * request instance per render is what lets those callers share a single read.
 */
const callerRequest = cache(async (): Promise<Request> => {
  const incoming = await headers();
  const forwarded = new Headers();
  const cookie = incoming.get("cookie");
  const authorization = incoming.get("authorization");
  if (cookie) forwarded.set("cookie", cookie);
  if (authorization) forwarded.set("authorization", authorization);
  return new Request("http://campusquest.internal/", { headers: forwarded });
});

/** The signed-in user, or a throw — the same contract route handlers get. */
async function currentUserId(): Promise<string> {
  return (await requireUser(await callerRequest())).id;
}

/* --------------------------------------------------------------- Profile -- */

/**
 * Deliberately passes `undefined` rather than the synthesized request, because
 * `getCurrentProfile` in the app shell does the same and `getFullProfile` is
 * memoized on its arguments — matching them is what collapses the layout's read
 * and the page's read into one. `supabaseForCaller(undefined)` resolves the
 * cookie-store client, which is the correct client during a render.
 */
export const getProfile = cache(async (): Promise<Profile> => {
  return Profile.parse(await getFullProfile(undefined, await currentUserId()));
});

/* ---------------------------------------------------------- Time Machine -- */

export const getAlignment = cache(async (): Promise<AlignmentResponse> => {
  const request = await callerRequest();
  return alignmentFor(request, await currentUserId());
});

export const getHistoricalRoles = cache(async (): Promise<HistoricalRole[]> => {
  const request = await callerRequest();
  return historicalRolesFor(request, await currentUserId());
});

/* ---------------------------------------------------------------- Quests -- */

export const getQuests = cache(async (): Promise<Quest[]> => {
  const request = await callerRequest();
  return Quest.array().parse(await listQuests(request, await currentUserId()));
});

export const getNextQuest = cache(async (): Promise<Quest> => {
  const request = await callerRequest();
  return Quest.parse(await nextQuest(request, await currentUserId()));
});

/* --------------------------------------------------------- Opportunities -- */

/**
 * `cache` keys on argument identity, and two callers passing an equivalent
 * query object would still be two distinct keys — so the query is reduced to a
 * stable string first. `/journey` reads the radar twice (the figure in the
 * stat column and the cards at the foot of the page) and must not send the
 * warehouse the same statement twice to do it.
 */
function queryKey(query: Record<string, unknown>): string {
  return JSON.stringify(query, Object.keys(query).sort());
}

const opportunitiesFor = cache(async (key: string): Promise<Opportunity[]> => {
  const request = await callerRequest();
  const query = OpportunityQuery.parse(JSON.parse(key) as unknown);
  const items = await opportunityRadar(request, await currentUserId(), query);
  return Opportunity.array().parse(items);
});

export function getOpportunities(query: OpportunityQuery = {}): Promise<Opportunity[]> {
  return opportunitiesFor(queryKey(query));
}

/* ----------------------------------------------------------------- Peers -- */

const peersFor = cache(async (key: string): Promise<PeerMatch[]> => {
  const request = await callerRequest();
  const query = PeopleQuery.parse(JSON.parse(key) as unknown);
  const matches = await peopleMatches(request, await currentUserId(), query);
  return PeerMatch.array().parse(matches);
});

export function getPeers(query: PeopleQuery = {}): Promise<PeerMatch[]> {
  return peersFor(queryKey(query));
}

/* -------------------------------------------------------------- Research -- */

export const getResearch = cache(async (): Promise<ResearchMatch[]> => {
  const request = await callerRequest();
  const profile = await getBackendProfile(request, await currentUserId());
  return ResearchMatch.array().parse(await researchMatches(profile));
});

/* ---------------------------------------------------------------- Badges -- */

export const getBadges = cache(async (): Promise<Badge[]> => {
  const request = await callerRequest();
  return Badge.array().parse(await listBadges(request, await currentUserId()));
});

/* ------------------------------------------------------------------ Chat -- */

export const getThreads = cache(async (): Promise<Thread[]> => {
  const request = await callerRequest();
  return Thread.array().parse(await listThreads(request, await currentUserId()));
});

/** `limit` mirrors the default in `GET /api/threads/:id/messages`. */
export const getMessages = cache(async (threadId: string, cursor?: string): Promise<MessagePage> => {
  const request = await callerRequest();
  const page = await listMessages(request, await currentUserId(), threadId, cursor ?? null, 30);
  return MessagePage.parse(page);
});
