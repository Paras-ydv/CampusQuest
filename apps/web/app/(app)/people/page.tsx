import type { Metadata } from "next";
import { PeopleView } from "@/components/app/people-view";
import { getPeersData } from "@/lib/data/server";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const peers = await getPeersData();
  return <PeopleView initialPeers={peers} />;
}
