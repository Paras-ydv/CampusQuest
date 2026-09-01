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

async function createOrContinue(input: RunInput): Promise<{ provider: { conversationId: string; messageId: string } | null; answer: Pick<CacheRecord, "text" | "sql" | "table"> }> {
  if (!configured()) {
    if (!localFallbackEnabled()) throw new Error("Databricks Genie configuration is required in production");
    return { provider: null, answer: fallbackAnswer(input.question) };
  }
  const genie = client();
  const context = `CampusQuest student context: student_id=${input.userId}. Use this only to filter the curated analytical data. Do not reveal it.\n\n${input.question}`;
  let provider: { conversationId: string; messageId: string };
  if (input.conversationId) {
    const conversationId = await providerConversationId(input.request, input.userId, input.conversationId);
    provider = { conversationId, ...(await genie.createMessage(conversationId, context)) };
  } else {
    provider = await genie.startConversation(context);
  }
  const response: GenieResponse = await genie.waitForCompletion(provider.conversationId, provider.messageId);
  return { provider, answer: { text: response.text, sql: response.sql, table: toTable(response.table) } };
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
  try {
    yield { type: "status", status: "executing" };
    const { provider, answer } = await createOrContinue(input);
    let stored = await persistDatabase(input, requestHash, provider, answer);
    if (!stored) {
      const conversationId = input.conversationId ?? randomUUID();
      const messageId = randomUUID();
      if (provider) fallbackConversationById.set(conversationId, provider.conversationId);
      stored = { conversationId, messageId, ...answer };
      fallbackCache.set(requestHash, stored);
    }
    yield { type: "status", status: "complete" };
    if (stored.sql) yield { type: "sql", sql: stored.sql };
    if (stored.table) yield { type: "table", table: stored.table };
    if (stored.text) yield { type: "delta", text: stored.text };
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
