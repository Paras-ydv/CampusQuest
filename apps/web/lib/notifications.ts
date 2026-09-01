import { z } from "zod";
import { createAdminSupabaseClient, supabaseForCaller } from "@/lib/supabase/server";

/**
 * ===========================================================================
 *  NOTIFICATIONS
 * ===========================================================================
 * Assembled from events the app already records, rather than a new event log:
 * incoming connection requests, messages other people sent you, and badges you
 * earned. Nothing here is generated for its own sake — every item corresponds
 * to a row someone else's action created.
 *
 * "Read" state is deliberately client-side. Tracking it server-side would mean
 * a per-user timestamp column and a write on every open; for a notification
 * bell the cost is not worth it, and the trade-off is only that the badge
 * count resets per browser rather than per account.
 */

export const Notification = z.object({
  id: z.string(),
  kind: z.enum(["connection_request", "connection_accepted", "message", "badge"]),
  title: z.string(),
  body: z.string(),
  href: z.string(),
  createdAt: z.string(),
});
export type Notification = z.infer<typeof Notification>;

const LOOKBACK_DAYS = 30;

export async function listNotifications(
  request: Request | undefined,
  userId: string,
): Promise<Notification[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return [];

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [requests, connections, messages, badges] = await Promise.all([
    // Someone wants to connect and is waiting on you.
    supabase
      .from("connection_requests")
      .select("id, requester_id, message, status, created_at")
      .eq("recipient_id", userId).eq("status", "pending")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(20),
    // A request you sent was accepted.
    supabase
      .from("connection_requests")
      .select("id, recipient_id, status, responded_at")
      .eq("requester_id", userId).eq("status", "accepted")
      .not("responded_at", "is", null)
      .gte("responded_at", since).order("responded_at", { ascending: false }).limit(20),
    // Messages other people sent in your threads.
    supabase
      .from("messages")
      .select("id, thread_id, sender_id, body, created_at")
      .neq("sender_id", userId)
      .gte("created_at", since).order("created_at", { ascending: false }).limit(30),
    supabase
      .from("user_badges")
      .select("badge_id, awarded_at, badges(name, description)")
      .eq("user_id", userId).gte("awarded_at", since)
      .order("awarded_at", { ascending: false }).limit(10),
  ]);

  // RLS already restricts messages to threads the caller belongs to, so no
  // extra membership filter is needed here.
  const peerIds = [
    ...new Set([
      ...(requests.data ?? []).map((r) => String(r.requester_id)),
      ...(connections.data ?? []).map((r) => String(r.recipient_id)),
      ...(messages.data ?? []).map((r) => String(r.sender_id)),
    ]),
  ];
  // Resolving who sent something needs the service-role client: `profiles_owner`
  // restricts a user to their own row, so the caller's own client cannot read
  // another student's name. Only the id and display name are selected, and this
  // is server-only — the same narrow use the people matcher already makes of it.
  const names = new Map<string, string>();
  if (peerIds.length) {
    const admin = createAdminSupabaseClient();
    if (admin) {
      const { data } = await admin.from("profiles").select("id, name").in("id", peerIds);
      for (const row of data ?? []) names.set(String(row.id), String(row.name));
    }
  }
  const nameOf = (id: string) => names.get(id) ?? "A student";

  const items: Notification[] = [
    ...(requests.data ?? []).map((row) => ({
      id: `req-${row.id}`,
      kind: "connection_request" as const,
      title: `${nameOf(String(row.requester_id))} wants to connect`,
      body: row.message ? String(row.message) : "Open People to accept or decline.",
      href: "/people",
      createdAt: String(row.created_at),
    })),
    ...(connections.data ?? []).map((row) => ({
      id: `acc-${row.id}`,
      kind: "connection_accepted" as const,
      title: `${nameOf(String(row.recipient_id))} accepted your request`,
      body: "You can message each other now.",
      href: "/messages",
      createdAt: String(row.responded_at),
    })),
    ...(messages.data ?? []).map((row) => ({
      id: `msg-${row.id}`,
      kind: "message" as const,
      title: `${nameOf(String(row.sender_id))} sent you a message`,
      body: String(row.body).slice(0, 110),
      href: "/messages",
      createdAt: String(row.created_at),
    })),
    ...(badges.data ?? []).map((row) => {
      const badge = row.badges as unknown as { name: string; description: string } | null;
      return {
        id: `badge-${row.badge_id}`,
        kind: "badge" as const,
        title: `Badge earned — ${badge?.name ?? row.badge_id}`,
        body: badge?.description ?? "",
        href: "/profile",
        createdAt: String(row.awarded_at),
      };
    }),
  ];

  return items
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 30);
}
