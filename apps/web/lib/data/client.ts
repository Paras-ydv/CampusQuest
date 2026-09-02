import type {
  ApiError,
  AlignmentResponse,
  ChatMessage,
  CompleteQuestResult,
  VerifyQuestStepResult,
  GenieStreamEvent,
  HistoricalRole,
  Opportunity,
  OpportunityQuery,
  PeerMatch,
  PeopleQuery,
  Profile,
  MessagePage,
  Quest,
  ResearchMatch,
  SimulateResponse,
  Thread,
} from "@campusquest/shared";
import type { Badge } from "@/lib/badges";

/**
 * ===========================================================================
 *  THE SWAP POINT
 * ===========================================================================
 * Every screen reads its data through this module and nothing else. Today each
 * function resolves a fixture after a short delay; when P2/P3/P4 ship their
 * route handlers, each body becomes a `fetch` and no component changes.
 *
 * The delay is deliberate — it keeps loading and skeleton states honest during
 * development instead of everything resolving instantly.
 */

const LATENCY_MS = 260;

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function apiUrl(path: string): string {
  if (typeof window !== "undefined") return path;
  const configured = process.env.CAMPUSQUEST_INTERNAL_ORIGIN ?? process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return `${configured.replace(/\/$/, "")}${path}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}${path}`;
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}${path}`;
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const forwarded: Record<string, string> = {};
  if (typeof window === "undefined") {
    const { headers } = await import("next/headers");
    const incoming = await headers();
    const cookie = incoming.get("cookie");
    const authorization = incoming.get("authorization");
    if (cookie) forwarded.Cookie = cookie;
    if (authorization) forwarded.Authorization = authorization;
  }
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...forwarded,
      ...init?.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const fallback: ApiError = { error: "HTTP_ERROR", message: `Request failed (${response.status})` };
    const body = await response.json().catch(() => fallback) as Partial<ApiError>;
    const error = typeof body.message === "string" && typeof body.error === "string" ? body as ApiError : fallback;
    throw new Error(`${error.error}: ${error.message}`);
  }
  return response.json() as Promise<T>;
}

/* --------------------------------------------------------------- Profile -- */

export function getProfile(): Promise<Profile> {
  // → GET /api/profile   (P1)
  return apiFetch<Profile>("/api/profile");
}

/* ---------------------------------------------------------- Time Machine -- */

export function getAlignment(): Promise<AlignmentResponse> {
  // → GET /api/timemachine/alignment   (P2, parameterised SQL — not Genie)
  return apiFetch<AlignmentResponse>("/api/timemachine/alignment");
}

export function getHistoricalRoles(): Promise<HistoricalRole[]> {
  // → GET /api/timemachine/roles   (P2)
  return apiFetch<HistoricalRole[]>("/api/timemachine/roles");
}

export function simulate(skillIds: string[]): Promise<SimulateResponse> {
  return apiFetch<SimulateResponse>("/api/timemachine/simulate", {
    method: "POST",
    body: JSON.stringify({ skillIds }),
  });

  // → POST /api/timemachine/simulate   (P2)
}

/* ---------------------------------------------------------------- Quests -- */

export function getQuests(): Promise<Quest[]> {
  // → GET /api/quests   (P3)
  return apiFetch<Quest[]>("/api/quests");
}

export function getNextQuest(): Promise<Quest> {
  // → GET /api/quests/next   (P3, deterministic ranking over P2's skill gaps)
  return apiFetch<Quest>("/api/quests/next");
}

export function completeQuest(questId: string): Promise<CompleteQuestResult> {
  // → POST /api/quests/:id/complete   (P3; also fires P2's profile sync)
  return apiFetch<CompleteQuestResult>(`/api/quests/${encodeURIComponent(questId)}/complete`, { method: "POST" });
}
export function verifyQuestStep(questId: string, stepId: string, repositoryUrl?: string): Promise<VerifyQuestStepResult> { return apiFetch(`/api/quests/${encodeURIComponent(questId)}/steps/${encodeURIComponent(stepId)}/verify`, { method: "POST", body: JSON.stringify(repositoryUrl ? { repositoryUrl } : {}) }); }

/* --------------------------------------------------------- Opportunities -- */

export function getOpportunities(
  query: OpportunityQuery = {},
): Promise<Opportunity[]> {
  // → GET /api/opportunities   (ranked server-side against Databricks; the UI
  //   never computes a match score)
  const params = new URLSearchParams();
  if (query.kinds?.length) params.set("kinds", query.kinds.join(","));
  if (query.difficulty) params.set("difficulty", query.difficulty);
  if (query.closingWithinDays) params.set("closingWithinDays", String(query.closingWithinDays));
  if (query.savedOnly) params.set("savedOnly", "true");
  if (query.search) params.set("search", query.search);
  return apiFetch<Opportunity[]>(`/api/opportunities${params.size ? `?${params}` : ""}`);
}

export function setOpportunitySaved(opportunityId: string, saved: boolean): Promise<{ opportunityId: string; saved: boolean }> {
  // → POST /api/opportunities
  return apiFetch<{ opportunityId: string; saved: boolean }>("/api/opportunities", {
    method: "POST",
    body: JSON.stringify({ opportunityId, saved }),
  });
}

/* ----------------------------------------------------------------- Peers -- */

export function getPeers(query: PeopleQuery = {}): Promise<PeerMatch[]> {
  // → GET /api/people/matches   (P3: pgvector retrieval + Genie rerank)
  const params = new URLSearchParams();
  if (query.interest) params.set("interest", query.interest);
  if (query.skillId) params.set("skillId", query.skillId);
  if (query.search) params.set("search", query.search);
  if (query.lookingForTeam !== undefined) params.set("lookingForTeam", String(query.lookingForTeam));
  return apiFetch<PeerMatch[]>(`/api/people/matches${params.size ? `?${params}` : ""}`);
}

/* -------------------------------------------------------------- Research -- */

export function getResearch(): Promise<ResearchMatch[]> {
  // → GET /api/research/matches   (P3 query layer over P4's ingested data)
  return apiFetch<ResearchMatch[]>("/api/research/matches");
}

/* ---------------------------------------------------------------- Badges -- */

export function getBadges(): Promise<Badge[]> {
  // → GET /api/badges   (evaluated server-side from real activity)
  return apiFetch<Badge[]>("/api/badges");
}

/* ------------------------------------------------------------------ Chat -- */

export function getThreads(): Promise<Thread[]> {
  // → GET /api/threads   (P3)
  return apiFetch<Thread[]>("/api/threads");
}

export function createThread(memberIds: string[]): Promise<Thread> {
  // → POST /api/threads   (P3)
  return apiFetch<Thread>("/api/threads", {
    method: "POST",
    body: JSON.stringify({ memberIds, kind: memberIds.length > 1 ? "group" : "direct" }),
  });
}

export function getMessages(threadId: string, cursor?: string): Promise<MessagePage> {
  // → GET /api/threads/:id/messages   (P3)
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  return apiFetch<MessagePage>(
    `/api/threads/${encodeURIComponent(threadId)}/messages${params.size ? `?${params}` : ""}`,
  );
}

export function sendMessage(threadId: string, body: string): Promise<ChatMessage> {
  // → POST /api/threads/:id/messages   (P3)
  return apiFetch<ChatMessage>(`/api/threads/${encodeURIComponent(threadId)}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
}

/* ----------------------------------------------------------------- Genie -- */

/**
 * Mock of the `/api/genie/ask` SSE stream (P2).
 *
 * Yields exactly the `GenieStreamEvent` frames the real endpoint will, in the
 * same order, so the chat UI is already written against the production
 * contract — only the transport changes later.
 */
export async function* askGenie(
  question: string,
  /**
   * Continue an existing conversation instead of starting a new one. Genie
   * keeps the earlier turns as context, so "what about Kubernetes?" resolves
   * against the question before it.
   */
  conversationId?: string,
): AsyncGenerator<GenieStreamEvent> {
  const path = conversationId
    ? `/api/genie/${encodeURIComponent(conversationId)}/follow-up`
    : "/api/genie/ask";
  const response = await fetch(apiUrl(path), {
    method: "POST",
    headers: { Accept: "text/event-stream", "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    throw new Error(`GENIE_ERROR: Request failed (${response.status})`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const data = frame.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
      if (data) yield JSON.parse(data) as GenieStreamEvent;
    }
    if (done) break;
  }
}
