import type { ConnectionRequest as ConnectionRequestType, ConnectionRequestInput } from "@campusquest/shared";
import { createRequestSupabaseClient, localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";
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
  const { data, error } = await supabase.from("connection_requests").upsert({ requester_id: userId, recipient_id: input.peerId, message: input.message ?? null, status: "pending" }, { onConflict: "requester_id,recipient_id", ignoreDuplicates: true }).select("*").maybeSingle();
  if (error) throw new Error(`Could not create connection request: ${error.message}`);
  if (data) return mapRequest(data);
  const { data: existing, error: existingError } = await supabase.from("connection_requests").select("*").eq("requester_id", userId).eq("recipient_id", input.peerId).single();
  if (existingError || !existing) throw new Error(`Could not read connection request: ${existingError?.message ?? "missing"}`);
  return mapRequest(existing);
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
  const { data, error } = await supabase.from("connection_requests").update({ status }).eq("id", id).select("*").single();
  if (error || !data) throw new Error(`Could not update connection request: ${error?.message ?? "missing"}`);
  return mapRequest(data);
}
