import type { Metadata } from "next";
import { MessagesView } from "@/components/app/messages-view";
import { getCurrentProfile } from "@/lib/auth/session";
import { getMessages, getPeers, getThreads } from "@/lib/data/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  // Peers resolve member ids to names; threads carry ids only.
  const [profile, threads, peers] = await Promise.all([
    getCurrentProfile(),
    getThreads(),
    getPeers(),
  ]);

  // Open on the most recently active thread so the pane is never empty when
  // there is something to show.
  const ordered = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const first = ordered[0];
  const initialMessages = first ? (await getMessages(first.id)).items : [];

  return (
    <MessagesView
      userId={profile.id}
      initialThreads={ordered}
      initialMessages={initialMessages}
      peers={peers}
    />
  );
}
