import type { ConnectionRequest as ConnectionRequestType, ConnectionRequestDetail, ConnectionRequestInput } from "@campusquest/shared";
import { createAdminSupabaseClient, createRequestSupabaseClient, localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";
import { invalidateUser } from "@/lib/data/warehouse-cache";

type StoredRequest = ConnectionRequestType;
const fallbackRequests = new Map<string, StoredRequest>();

function mapRequest(row: { id: string; requester_id: string; recipient_id: string; message: string | null; status: string; created_at: string; responded_at: string | null }): ConnectionRequestType {
  return { id: row.id, requesterId: row.requester_id, recipientId: row.recipient_id, message: row.message, status: row.status as ConnectionRequestType["status"], createdAt: row.created_at, respondedAt: row.responded_at };
}

export async function listConnectionRequests(request: Request, userId: string): Promise<ConnectionRequestType[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [...fallbackRequests.values()].filter((item) => item.requesterId === userId || item.recipientId === userId);
  const { data, error } = await supabase.from("connection_requests").select("*").or(`requester_id.eq.${userId},recipient_id.eq.${userId}`).order("created_at", { ascending: false });
  if (error) throw new Error(`Could not load connection requests: ${error.message}`);
  return (data ?? []).map(mapRequest);
}

export async function createConnectionRequest(request: Request, userId: string, input: ConnectionRequestInput): Promise<ConnectionRequestType> {
  if (input.peerId === userId) throw new Error("FORBIDDEN");
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const existing = [...fallbackRequests.values()].find((item) => item.requesterId === userId && item.recipientId === input.peerId);
    if (existing) return existing;
    const result: ConnectionRequestType = { id: crypto.randomUUID(), requesterId: userId, recipientId: input.peerId, message: input.message ?? null, status: "pending", createdAt: new Date().toISOString(), respondedAt: null };
    fallbackRequests.set(result.id, result);
    invalidateUser(userId);
  return result;
  }
  const { data: existing } = await supabase
    .from("connection_requests").select("*")
    .eq("requester_id", userId).eq("recipient_id", input.peerId).maybeSingle();

  // Already pending, or already accepted: nothing to do either way.
  if (existing && (existing.status === "pending" || existing.status === "accepted")) {
    return mapRequest(existing);
  }

  if (existing) {
    /*
     * The row is rejected or cancelled. This used to upsert with
     * ignoreDuplicates, which silently kept the old row and returned success —
     * so once someone declined you, every later request appeared to send and
     * never reached them again. Reopening the row is what lets people ask a
     * second time after circumstances change.
     */
    const { data, error } = await supabase
      .from("connection_requests")
      .update({ status: "pending", message: input.message ?? null, responded_at: null })
      .eq("id", existing.id).select("*").single();
    if (error || !data) throw new Error(`Could not reopen connection request: ${error?.message ?? "missing"}`);
    invalidateUser(userId);
    invalidateUser(input.peerId);
    return mapRequest(data);
  }

  const { data, error } = await supabase
    .from("connection_requests")
    .insert({ requester_id: userId, recipient_id: input.peerId, message: input.message ?? null, status: "pending" })
    .select("*").single();
  if (error || !data) throw new Error(`Could not create connection request: ${error?.message ?? "missing"}`);
  invalidateUser(userId);
  invalidateUser(input.peerId);
  return mapRequest(data);
}

export async function respondToConnectionRequest(request: Request, userId: string, id: string, status: "accepted" | "rejected" | "cancelled"): Promise<ConnectionRequestType> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    const current = fallbackRequests.get(id);
    if (!current || (status === "cancelled" ? current.requesterId : current.recipientId) !== userId) throw new Error("FORBIDDEN");
    if (current.status !== "pending") return current;
    const next = { ...current, status, respondedAt: status === "cancelled" ? null : new Date().toISOString() } as ConnectionRequestType;
    fallbackRequests.set(id, next); return next;
  }
  const { data: current, error: lookupError } = await supabase.from("connection_requests").select("*").eq("id", id).single();
  if (lookupError || !current) throw new Error(lookupError?.code === "PGRST116" ? "NOT_FOUND" : `Could not load connection request: ${lookupError?.message}`);
  if ((status === "cancelled" ? current.requester_id : current.recipient_id) !== userId) throw new Error("FORBIDDEN");
  if (current.status !== "pending") return mapRequest(current);
  if (status === "accepted") {
    // Setting the status alone left `connections` empty, so nobody was ever
    // actually connected. The RPC does both writes in one transaction.
    const { data, error } = await supabase.rpc("accept_connection_request", { p_request_id: id } as never);
    if (error) throw new Error(`Could not accept connection request: ${error.message}`);
    invalidateUser(userId);
    invalidateUser(String(current.requester_id));
    return mapRequest((data ?? current) as typeof current);
  }

  const { data, error } = await supabase.from("connection_requests").update({ status, responded_at: new Date().toISOString() }).eq("id", id).select("*").single();
  if (error || !data) throw new Error(`Could not update connection request: ${error?.message ?? "missing"}`);
  invalidateUser(userId);
  return mapRequest(data);
}


/**
 * Pending requests in both directions, with the other person attached.
 *
 * `connection_requests` stores ids only, and `profiles_owner` stops a student
 * reading a counterpart's row, so the names come from the service-role client —
 * limited to id, name, email and initials, and only for people who have already
 * sent or received a request from the caller.
 */
export async function listPendingRequests(
  request: Request | undefined,
  userId: string,
): Promise<ConnectionRequestDetail[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [];

  const { data } = await supabase
    .from("connection_requests")
    .select("id, requester_id, recipient_id, message, created_at, status")
    .eq("status", "pending")
    .or(`requester_id.eq.${userId},recipient_id.eq.${userId}`)
    .order("created_at", { ascending: false });

  const rows = data ?? [];
  if (!rows.length) return [];

  const peerIds = [...new Set(rows.map((r) => String(r.requester_id === userId ? r.recipient_id : r.requester_id)))];
  const admin = createAdminSupabaseClient();
  const names = new Map<string, { name: string; email: string; initials: string }>();
  if (admin) {
    const { data: people } = await admin.from("profiles").select("id, name, email, initials").in("id", peerIds);
    for (const row of people ?? []) {
      names.set(String(row.id), { name: String(row.name), email: String(row.email), initials: String(row.initials) });
    }
  }

  return rows.map((row) => {
    const outgoing = String(row.requester_id) === userId;
    const peerId = String(outgoing ? row.recipient_id : row.requester_id);
    const peer = names.get(peerId);
    return {
      id: String(row.id),
      direction: outgoing ? "outgoing" : "incoming",
      peerId,
      peerName: peer?.name ?? "Unknown student",
      peerEmail: peer?.email ?? "",
      peerInitials: peer?.initials ?? "??",
      message: row.message ? String(row.message) : null,
      createdAt: String(row.created_at),
    } satisfies ConnectionRequestDetail;
  });
}

/**
 * Everyone the caller is actually connected to, with just enough identity to
 * name them.
 *
 * Deliberately separate from the matchmaker: "who can I message?" is a plain
 * Supabase lookup, and clients poll it, so it must not drag the warehouse and
 * embedding work of `/api/people/matches` along with it.
 */
export async function listConnectedPeers(
  request: Request | undefined,
  userId: string,
): Promise<{ id: string; name: string; email: string; initials: string }[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [];

  const { data } = await supabase
    .from("connections")
    .select("user_a_id, user_b_id")
    .or(`user_a_id.eq.${userId},user_b_id.eq.${userId}`);

  const peerIds = [
    ...new Set(
      (data ?? [])
        .map((row) => String(row.user_a_id) === userId ? String(row.user_b_id) : String(row.user_a_id))
        .filter((id) => id !== userId),
    ),
  ];
  if (!peerIds.length) return [];

  // As in `listPendingRequests`, `profiles_owner` hides other students' rows,
  // so identity comes from the service-role client for these ids only.
  const admin = createAdminSupabaseClient();
  if (!admin) return [];
  const { data: people } = await admin.from("profiles").select("id, name, email, initials").in("id", peerIds);
  return (people ?? []).map((row) => ({
    id: String(row.id), name: String(row.name),
    email: String(row.email), initials: String(row.initials),
  }));
}
