import type { ChatMessage, CreateThreadInput, MessagePage, Thread } from "@campusquest/shared";
import { createAdminSupabaseClient, localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";

const fallbackThreads = new Map<string, Thread>();
const fallbackMessages = new Map<string, ChatMessage[]>();

function mapThread(row: { id: string; kind: string; created_at: string; updated_at: string; thread_members?: { user_id: string }[] }): Thread {
  return { id: row.id, kind: row.kind as Thread["kind"], createdAt: row.created_at, updatedAt: row.updated_at, memberIds: (row.thread_members ?? []).map((member) => member.user_id) };
}
function mapMessage(row: { id: string; thread_id: string; sender_id: string; body: string; created_at: string; edited_at: string | null }): ChatMessage {
  return { id: row.id, threadId: row.thread_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at, editedAt: row.edited_at };
}
function cursorFor(message: ChatMessage): string { return `${message.createdAt}|${message.id}`; }
function parseCursor(cursor: string | null): { createdAt: string; id: string } | null {
  if (!cursor) return null; const index = cursor.lastIndexOf("|");
  if (index <= 0) throw new Error("INVALID_CURSOR");
  return { createdAt: cursor.slice(0, index), id: cursor.slice(index + 1) };
}

export type ThreadMember = { id: string; name: string; email: string; initials: string };

/**
 * Everyone the caller shares a thread with, by id.
 *
 * The messages screen used to name people from the peer-match list, which only
 * contains current matches — so any thread with someone outside it rendered as
 * "Unknown student" with no email, which is precisely the case where telling
 * people apart matters most.
 *
 * Needs the service-role client: `profiles_owner` restricts a student to their
 * own row, so the caller cannot read a counterpart's name. Only id, name, email
 * and initials are selected, and only for people they already share a thread
 * with.
 */
export async function threadMemberDirectory(
  request: Request | undefined,
  userId: string,
): Promise<ThreadMember[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [];

  const { data: mine } = await supabase.from("thread_members").select("thread_id").eq("user_id", userId);
  const threadIds = (mine ?? []).map((row) => String(row.thread_id));
  if (!threadIds.length) return [];

  const { data: members } = await supabase.from("thread_members").select("user_id").in("thread_id", threadIds);
  const ids = [...new Set((members ?? []).map((row) => String(row.user_id)))].filter((id) => id !== userId);
  if (!ids.length) return [];

  const admin = createAdminSupabaseClient();
  if (!admin) return [];
  const { data } = await admin.from("profiles").select("id, name, email, initials").in("id", ids);
  return (data ?? []).map((row) => ({
    id: String(row.id), name: String(row.name),
    email: String(row.email), initials: String(row.initials),
  }));
}

export async function listThreads(request: Request | undefined, userId: string): Promise<Thread[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [...fallbackThreads.values()].filter((thread) => thread.memberIds.includes(userId));
  const { data, error } = await supabase.from("threads").select("*, thread_members(user_id)").order("updated_at", { ascending: false });
  if (error) throw new Error(`Could not load threads: ${error.message}`);
  return (data ?? []).map((row) => mapThread(row as unknown as Parameters<typeof mapThread>[0]));
}

export async function createThread(request: Request | undefined, userId: string, input: CreateThreadInput): Promise<Thread> {
  if (input.kind !== "direct" || input.memberIds.length !== 1 || input.memberIds[0] === userId) throw new Error("Only a direct thread with one other member is supported");
  const otherUserId = input.memberIds[0]!;
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const memberIds = [userId, otherUserId].sort();
    const existing = [...fallbackThreads.values()].find((thread) => thread.kind === "direct" && [...thread.memberIds].sort().join(":") === memberIds.join(":"));
    if (existing) return existing;
    const now = new Date().toISOString(); const result: Thread = { id: crypto.randomUUID(), kind: "direct", createdAt: now, updatedAt: now, memberIds };
    fallbackThreads.set(result.id, result); return result;
  }
  const { data: id, error } = await supabase.rpc("create_direct_thread", { p_other_user_id: otherUserId });
  if (error || !id) {
    // Being unconnected is an expected refusal, not a server fault — it should
    // read as 403 with a usable message rather than a blank 500.
    if (/not connected/i.test(error?.message ?? "")) {
      throw new Error("FORBIDDEN");
    }
    throw new Error(`Could not create thread: ${error?.message ?? "missing id"}`);
  }
  const { data: row, error: loadError } = await supabase.from("threads").select("*, thread_members(user_id)").eq("id", id).single();
  if (loadError || !row) throw new Error(`Could not load thread: ${loadError?.message ?? "missing"}`);
  return mapThread(row as unknown as Parameters<typeof mapThread>[0]);
}

export async function listMessages(request: Request | undefined, userId: string, threadId: string, cursor: string | null, limit: number): Promise<MessagePage> {
  parseCursor(cursor); // reject malformed cursors before querying
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    const thread = fallbackThreads.get(threadId);
    if (!thread) throw new Error("NOT_FOUND");
    if (!thread.memberIds.includes(userId)) throw new Error("FORBIDDEN");
    const values = [...(fallbackMessages.get(threadId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    const after = cursor ? values.findIndex((message) => cursorFor(message) === cursor) + 1 : 0;
    const items = values.slice(Math.max(0, after), Math.max(0, after) + limit);
    return { items, total: values.length, cursor: values[Math.max(0, after) + limit] ? cursorFor(items[items.length - 1]!) : null };
  }
  const { data: membership, error: membershipError } = await supabase.from("thread_members").select("thread_id").eq("thread_id", threadId).eq("user_id", userId).maybeSingle();
  if (membershipError || !membership) throw new Error("FORBIDDEN");
  let query = supabase.from("messages").select("*", { count: "exact" }).eq("thread_id", threadId).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit + 1);
  const parsed = parseCursor(cursor);
  if (parsed) query = query.or(`created_at.lt.${parsed.createdAt},and(created_at.eq.${parsed.createdAt},id.lt.${parsed.id})`);
  const { data, error, count } = await query;
  if (error) throw new Error(`Could not load messages: ${error.message}`);
  const messages = (data ?? []).map((row) => mapMessage(row));
  const hasMore = messages.length > limit;
  const page = hasMore ? messages.slice(0, limit) : messages;
  // The query pages newest-first so the cursor walks backwards through history,
  // but a transcript reads oldest-first. Returning the query order put the
  // newest message at the top of the thread.
  const items = [...page].reverse();
  return {
    items,
    total: count ?? items.length,
    // The cursor still refers to the oldest row in this page, which is the
    // last one the query returned, not the last one we render.
    cursor: hasMore && page.length ? cursorFor(page[page.length - 1]!) : null,
  };
}

export async function sendMessage(request: Request | undefined, userId: string, threadId: string, body: string): Promise<ChatMessage> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const thread = fallbackThreads.get(threadId);
    if (!thread) throw new Error("NOT_FOUND");
    if (!thread.memberIds.includes(userId)) throw new Error("FORBIDDEN");
    const result: ChatMessage = { id: crypto.randomUUID(), threadId, senderId: userId, body, createdAt: new Date().toISOString(), editedAt: null };
    fallbackMessages.set(threadId, [...(fallbackMessages.get(threadId) ?? []), result]); return result;
  }
  // Sender comes only from the authenticated session; the body carries no sender field.
  const { data, error } = await supabase.from("messages").insert({ thread_id: threadId, sender_id: userId, body }).select("*").single();
  if (error || !data) throw new Error(`Could not send message: ${error?.message ?? "missing"}`);
  return mapMessage(data);
}
