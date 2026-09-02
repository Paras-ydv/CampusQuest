import type { Metadata } from "next";
import { MessagesView } from "@/components/app/messages-view";
import { getCurrentProfile } from "@/lib/auth/session";
import { getMessagesData, getPeersData, getThreadMembersData, getThreadsData } from "@/lib/data/server";

export const metadata: Metadata = { title: "Messages" };

export default async function MessagesPage() {
  // Peers resolve member ids to names; threads carry ids only.
  const [profile, threads, peers, members] = await Promise.all([
    getCurrentProfile(),
    getThreadsData(),
    getPeersData(),
    // Names for everyone in a thread, including people who are not current
    // matches — the peer list alone leaves those as "Unknown student".
    getThreadMembersData(),
  ]);

  // Open on the most recently active thread so the pane is never empty when
  // there is something to show.
  const ordered = [...threads].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const first = ordered[0];
  const initialMessages = first ? await getMessagesData(first.id) : [];

  return (
    <MessagesView
      userId={profile.id}
      initialThreads={ordered}
      initialMessages={initialMessages}
      peers={peers}
      members={members}
    />
  );
}
