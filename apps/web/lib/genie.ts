import { createHash, randomUUID } from "node:crypto";
import { GenieClient, type GenieResponse, type GenieResultTable as ProviderTable } from "@campusquest/genie-client";
import type { GenieResultTable, GenieStatus, GenieStreamEvent } from "@campusquest/shared";
import { GENIE_DEMO_ANSWER, GENIE_DEMO_SQL, GENIE_DEMO_TABLE } from "@/lib/data/fixtures";
import { createRequestSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

type RunInput = { request: Request; userId: string; question: string; conversationId?: string };
type CacheRecord = { conversationId: string; messageId: string; text: string; sql: string | null; table: GenieResultTable | null };
const fallbackCache = new Map<string, CacheRecord>();
const fallbackConversationById = new Map<string, string>();

function configured(): boolean { return Boolean(process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN && process.env.DATABRICKS_GENIE_SPACE_ID); }
function hashQuestion(userId: string, question: string): string { return createHash("sha256").update(`${userId}\n${question.trim().replace(/\s+/g, " ").toLowerCase()}`).digest("hex"); }
function iso(): string { return new Date().toISOString(); }
function toTable(table: ProviderTable | null): GenieResultTable | null {
  return table ? { columns: table.columns, rows: table.rows, truncated: table.truncated } : null;
}
function client(): GenieClient {
  const host = process.env.DATABRICKS_HOST;
  const token = process.env.DATABRICKS_TOKEN;
  const spaceId = process.env.DATABRICKS_GENIE_SPACE_ID;
  if (!host || !token || !spaceId) throw new Error("Databricks Genie configuration is required in production");
  return new GenieClient({ host, token, spaceId });
}
function sseEvent(event: GenieStreamEvent): Uint8Array { return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`); }

async function cachedFromDatabase(request: Request, userId: string, requestHash: string): Promise<CacheRecord | null> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) return null;
  const { data } = await (supabase.from("genie_messages") as any)
    .select("id, content, generated_sql, result_table, conversation_id")
    .eq("user_id", userId).eq("role", "assistant").eq("request_hash", requestHash).maybeSingle();
  if (!data) return null;
  return { conversationId: String(data.conversation_id), messageId: String(data.id), text: String(data.content), sql: typeof data.generated_sql === "string" ? data.generated_sql : null, table: data.result_table as GenieResultTable | null };
}

async function persistDatabase(input: RunInput, requestHash: string, provider: { conversationId: string; messageId: string } | null, answer: Pick<CacheRecord, "text" | "sql" | "table">): Promise<CacheRecord | null> {
  const supabase = createRequestSupabaseClient(input.request);
  if (!supabase) return null;
  let localConversationId = input.conversationId;
  if (!localConversationId) {
    const { data, error } = await (supabase.from("genie_conversations") as any)
      .insert({ user_id: input.userId, title: input.question.slice(0, 120), provider_conversation_id: provider?.conversationId ?? null })
      .select("id").single();
    if (error || !data) throw new Error(`Could not persist Genie conversation: ${error?.message ?? "unknown error"}`);
    localConversationId = String(data.id);
  }
  await (supabase.from("genie_messages") as any).insert({
    conversation_id: localConversationId, user_id: input.userId, role: "user", content: input.question,
    request_hash: requestHash, status: "complete",
  });
  const { data, error } = await (supabase.from("genie_messages") as any).insert({
    conversation_id: localConversationId, user_id: input.userId, role: "assistant", content: answer.text,
    request_hash: requestHash, provider_message_id: provider?.messageId ?? null, status: "complete",
    result_table: answer.table, generated_sql: answer.sql,
  }).select("id").single();
  if (error || !data) {
    // A concurrent duplicate request reuses the database-enforced cache.
    const cached = await cachedFromDatabase(input.request, input.userId, requestHash);
    if (cached) return cached;
    throw new Error(`Could not cache Genie response: ${error?.message ?? "unknown error"}`);
  }
  return { conversationId: localConversationId, messageId: String(data.id), ...answer };
}

async function providerConversationId(request: Request, userId: string, localConversationId: string): Promise<string> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) {
    const value = fallbackConversationById.get(localConversationId);
    if (!value) throw new Error("NOT_FOUND");
    return value;
  }
  const { data, error } = await (supabase.from("genie_conversations") as any).select("provider_conversation_id").eq("id", localConversationId).eq("user_id", userId).single();
  if (error || !data?.provider_conversation_id) throw new Error(error?.code === "PGRST116" ? "NOT_FOUND" : "This conversation has no Databricks provider ID");
  return String(data.provider_conversation_id);
}

function fallbackAnswer(question: string): Pick<CacheRecord, "text" | "sql" | "table"> {
  const leading = question.trim().toLowerCase().startsWith("what") ? GENIE_DEMO_ANSWER : `Based on the deterministic CampusQuest data, ${GENIE_DEMO_ANSWER}`;
  return { text: leading, sql: GENIE_DEMO_SQL, table: GENIE_DEMO_TABLE };
}

/**
 * The profile facts Genie needs, stated inline.
 *
 * This used to pass the caller's Supabase user id as `student_id`. The
 * warehouse keys its own students as S0000, so that id matched nothing:
 * every personalised question joined `students`, `skill_gap_view` or
 * `role_alignment` to zero rows and Genie correctly reported that there was no
 * data — an answer that looked like a product failure. It also leaked a raw
 * UUID into the SQL shown in the UI.
 *
 * Supplying the goal role and held skills instead lets Genie reason about this
 * student without needing a row for them in the warehouse, which they will
 * never have: they are an application user, not a synthetic analytical record.
 */
async function studentContext(input: RunInput): Promise<string> {
  try {
    const { getBackendProfile } = await import("@/lib/backend/profile");
    const { resolveRoleFamily } = await import("@/lib/data/role-families");
    const profile = await getBackendProfile(input.request, input.userId);
    const skills = profile.skills.map((skill) => skill.name).join(", ") || "none recorded";
    const interests = profile.interests.join(", ") || "none recorded";
    return [
      "CampusQuest student context — the person asking is an application user and has NO row in the `students` table.",
      `Their target role family is "${resolveRoleFamily(profile.goalRole)}", which matches job_roles.role_family.`,
      `Skills they already hold: ${skills}.`,
      `Interests: ${interests}.`,
      "Answer using these facts. Do not filter students, skill_gap_view or role_alignment by a student_id for this person, and never invent one.",
    ].join("\n");
  } catch {
    // Without a profile Genie can still answer aggregate questions, which is
    // better than failing the whole turn.
    return "CampusQuest context: answer from the curated campus data. No individual student profile is available for this question.";
  }
}

/**
 * Runs the Genie turn, reporting progress as it happens rather than only at
 * the end.
 *
 * Genie exposes its generated SQL roughly ten seconds before it finishes
 * writing the prose answer, and the warehouse result lands shortly after that.
 * Waiting for COMPLETED before emitting anything meant the panel sat silent for
 * the entire turn and then filled in at once. `onProgress` forwards each new
 * piece the moment it appears.
 */
async function createOrContinue(
  input: RunInput,
  onProgress: (event: GenieStreamEvent) => void,
): Promise<{ provider: { conversationId: string; messageId: string } | null; answer: Pick<CacheRecord, "text" | "sql" | "table"> }> {
  if (!configured()) {
    if (!localFallbackEnabled()) throw new Error("Databricks Genie configuration is required in production");
    return { provider: null, answer: fallbackAnswer(input.question) };
  }
  const genie = client();
  const context = `${await studentContext(input)}\n\n${input.question}`;
  let provider: { conversationId: string; messageId: string };
  if (input.conversationId) {
    const conversationId = await providerConversationId(input.request, input.userId, input.conversationId);
    provider = { conversationId, ...(await genie.createMessage(conversationId, context)) };
  } else {
    provider = await genie.startConversation(context);
  }

  // Emit each artefact once, the first time a poll reveals it.
  //
  // Genie's own lifecycle oscillates — ASKING_AI, PENDING_WAREHOUSE, then
  // ASKING_AI again while it writes the prose — so reporting each transition
  // verbatim makes the panel appear to go backwards from "Querying campus
  // data" to "Reading your profile". Progress is therefore monotonic: a status
  // is only forwarded when it represents a later phase than the last one sent.
  const PHASE: Record<GenieStatus, number> = {
    pending: 0, interpreting: 1, executing: 2, complete: 3, failed: 3,
  };
  let sentStatus: GenieStatus | null = "interpreting";
  let sentSql = false;
  let sentTable = false;
  const response: GenieResponse = await genie.waitForCompletion(
    provider.conversationId,
    provider.messageId,
    (partial) => {
      const isForward = !sentStatus || PHASE[partial.status] > PHASE[sentStatus];
      if (isForward && partial.status !== "complete" && partial.status !== "failed") {
        sentStatus = partial.status;
        onProgress({ type: "status", status: partial.status });
      }
      if (!sentSql && partial.sql) {
        sentSql = true;
        onProgress({ type: "sql", sql: partial.sql });
      }
      if (!sentTable && partial.table) {
        sentTable = true;
        onProgress({ type: "table", table: toTable(partial.table)! });
      }
    },
  );
  return { provider, answer: { text: response.text, sql: response.sql, table: toTable(response.table) } };
}

/**
 * Bridges the callback-style progress reporting above into the async generator
 * the SSE route consumes, without buffering. Events pushed by `emit` are
 * yielded as soon as the consumer asks for them.
 */
function eventBridge() {
  const queue: GenieStreamEvent[] = [];
  let wake: (() => void) | null = null;
  return {
    emit(event: GenieStreamEvent) {
      queue.push(event);
      wake?.();
      wake = null;
    },
    /** Resolves when there is something to drain, or the work settles. */
    async waitForNext(work: Promise<unknown>): Promise<void> {
      if (queue.length) return;
      await Promise.race([work.catch(() => undefined), new Promise<void>((resolve) => { wake = resolve; })]);
    },
    drain(): GenieStreamEvent[] {
      return queue.splice(0, queue.length);
    },
  };
}

/** Returns the exact SSE event lifecycle rendered by P1's Genie panel. */
export async function* runGenie(input: RunInput): AsyncGenerator<GenieStreamEvent> {
  const requestHash = hashQuestion(input.userId, input.question);
  yield { type: "status", status: "pending" };

  const cached = fallbackCache.get(requestHash) ?? await cachedFromDatabase(input.request, input.userId, requestHash);
  if (cached) {
    yield { type: "status", status: "complete" };
    if (cached.sql) yield { type: "sql", sql: cached.sql };
    if (cached.table) yield { type: "table", table: cached.table };
    if (cached.text) yield { type: "delta", text: cached.text };
    yield { type: "done", conversationId: cached.conversationId, messageId: cached.messageId };
    return;
  }

  yield { type: "status", status: "interpreting" };

  const bridge = eventBridge();
  const work = createOrContinue(input, bridge.emit);
  let settled = false;
  const tracked = work.then(
    (value) => { settled = true; bridge.emit({ type: "status", status: "complete" }); return value; },
    (error) => { settled = true; bridge.emit({ type: "status", status: "failed" }); throw error; },
  );
  // Swallow here so an early rejection cannot become an unhandled rejection
  // while we are still draining; the await below rethrows it in order.
  tracked.catch(() => undefined);

  // Forward progress as Genie produces it: statuses, then the SQL, then the
  // result table — each typically seconds ahead of the final prose.
  let sawSql = false;
  let sawTable = false;
  try {
    while (true) {
      await bridge.waitForNext(tracked);
      for (const event of bridge.drain()) {
        if (event.type === "sql") sawSql = true;
        if (event.type === "table") sawTable = true;
        if (event.type === "status" && event.status === "complete") continue;
        yield event;
      }
      if (settled) break;
    }

    const { provider, answer } = await tracked;
    for (const event of bridge.drain()) {
      if (event.type === "status" && event.status === "complete") continue;
      yield event;
    }

    yield { type: "status", status: "complete" };
    // Only emit what progress did not already deliver.
    if (answer.sql && !sawSql) yield { type: "sql", sql: answer.sql };
    if (answer.table && !sawTable) yield { type: "table", table: answer.table };
    if (answer.text) yield { type: "delta", text: answer.text };

    // Persisted after the answer is on screen, not before it: caching is for
    // the *next* identical question and should not delay this one.
    let stored = await persistDatabase(input, requestHash, provider, answer);
    if (!stored) {
      const conversationId = input.conversationId ?? randomUUID();
      const messageId = randomUUID();
      if (provider) fallbackConversationById.set(conversationId, provider.conversationId);
      stored = { conversationId, messageId, ...answer };
      fallbackCache.set(requestHash, stored);
    }
    yield { type: "done", conversationId: stored.conversationId, messageId: stored.messageId };
  } catch (error) {
    yield { type: "status", status: "failed" };
    yield { type: "error", message: error instanceof Error ? error.message : "Genie request failed" };
  }
}

export function genieSseResponse(input: RunInput): Response {
  const iterator = runGenie(input);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try { for await (const event of iterator) controller.enqueue(sseEvent(event)); }
      finally { controller.close(); }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" } });
}

export async function genieNarrative(userId: string, prompt: string): Promise<string> {
  if (!configured()) return fallbackAnswer(prompt).text;
  const run = await client().startConversation(`CampusQuest rationale only. Student ${userId}. Return a concise evidence-based narrative without inventing numbers.\n\n${prompt}`);
  return (await client().waitForCompletion(run.conversationId, run.messageId)).text;
}
