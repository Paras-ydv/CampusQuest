"use client";

import { createClient, type RealtimeChannel } from "@supabase/supabase-js";
import type { ChatMessage } from "@campusquest/shared";

export type ThreadSubscription = {
  unsubscribe: () => Promise<string>;
};

/**
 * Browser-only helper. Database RLS authorizes the postgres_changes stream;
 * presence is advisory and is never converted into a persisted message.
 */
export function subscribeToThread(options: {
  threadId: string;
  userId: string;
  onMessage: (message: ChatMessage) => void;
  onPresence?: (userIds: string[]) => void;
}): ThreadSubscription {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Supabase browser configuration is missing");
  const client = createClient(url, key);
  const delivered = new Set<string>();
  let channel: RealtimeChannel = client.channel(`thread:${options.threadId}`, { config: { presence: { key: options.userId } } });
  channel = channel
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `thread_id=eq.${options.threadId}` }, (event) => {
      const row = event.new as { id: string; thread_id: string; sender_id: string; body: string; created_at: string; edited_at?: string | null };
      if (delivered.has(row.id)) return;
      delivered.add(row.id);
      options.onMessage({ id: row.id, threadId: row.thread_id, senderId: row.sender_id, body: row.body, createdAt: row.created_at, editedAt: row.edited_at ?? null });
    })
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState<{ userId?: string }>();
      options.onPresence?.([...new Set(Object.values(state).flat().map((item) => item.userId).filter((id): id is string => Boolean(id)))]);
    })
    .subscribe((status) => { if (status === "SUBSCRIBED") void channel.track({ userId: options.userId }); });
  return { unsubscribe: () => client.removeChannel(channel) };
}
