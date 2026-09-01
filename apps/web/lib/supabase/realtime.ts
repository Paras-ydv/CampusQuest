"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import type { ChatMessage } from "@campusquest/shared";
import { createBrowserSupabaseClient } from "./browser";

export type ThreadSubscription = {
  unsubscribe: () => Promise<string>;
};

/**
 * Live message delivery for one thread.
 *
 * Realtime's `postgres_changes` enforces the same row-level security as a
 * normal query, against the token the *socket* was opened with. This used to
 * build a bare anonymous client, so the socket authenticated as `anon`, the
 * `messages_members_read` policy matched nothing, and the subscription sat
 * connected while delivering no events — the channel reported SUBSCRIBED and
 * messages only appeared on reload.
 *
 * The browser client carries the signed-in session, and `realtime.setAuth`
 * hands that token to the socket. Both are required: the client alone does not
 * authenticate the websocket.
 */
export function subscribeToThread(options: {
  threadId: string;
  userId: string;
  onMessage: (message: ChatMessage) => void;
  onPresence?: (userIds: string[]) => void;
  onStatus?: (status: "connected" | "disconnected") => void;
}): ThreadSubscription {
  const client = createBrowserSupabaseClient();
  if (!client) throw new Error("Supabase browser configuration is missing");

  const delivered = new Set<string>();
  let channel: RealtimeChannel = client.channel(`thread:${options.threadId}`, {
    config: { presence: { key: options.userId } },
  });

  channel = channel
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${options.threadId}` },
      (event) => {
        const row = event.new as {
          id: string; thread_id: string; sender_id: string; body: string;
          created_at: string; edited_at?: string | null;
        };
        if (delivered.has(row.id)) return;
        delivered.add(row.id);
        options.onMessage({
          id: row.id, threadId: row.thread_id, senderId: row.sender_id,
          body: row.body, createdAt: row.created_at, editedAt: row.edited_at ?? null,
        });
      },
    )
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ userId?: string }>();
      options.onPresence?.([
        ...new Set(
          Object.values(state).flat().map((item) => item.userId).filter((id): id is string => Boolean(id)),
        ),
      ]);
    });

  // The socket must be given the user's token before it opens, or every event
  // is filtered out by RLS.
  void client.auth.getSession().then(({ data }) => {
    const token = data.session?.access_token;
    if (token) client.realtime.setAuth(token);
    channel.subscribe((status) => {
      options.onStatus?.(status === "SUBSCRIBED" ? "connected" : "disconnected");
      if (status === "SUBSCRIBED") void channel.track({ userId: options.userId });
    });
  });

  return { unsubscribe: () => client.removeChannel(channel) };
}
