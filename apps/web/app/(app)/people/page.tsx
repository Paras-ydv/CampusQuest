import type { Metadata } from "next";
import { PeopleView } from "@/components/app/people-view";
import { getPeers } from "@/lib/data/client";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const peers = await getPeers();
  return <PeopleView initialPeers={peers} />;
}
