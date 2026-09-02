import type { Metadata } from "next";
import { ConnectionRequests } from "@/components/app/connection-requests";
import { PeopleView } from "@/components/app/people-view";
import { getPeersData, getPendingRequestsData } from "@/lib/data/server";

export const metadata: Metadata = { title: "People" };

export default async function PeoplePage() {
  const [peers, requests] = await Promise.all([getPeersData(), getPendingRequestsData()]);

  return (
    <>
      {/* Requests first: someone is waiting on a decision, and until now there
          was nowhere in the product to make it. */}
      <ConnectionRequests requests={requests} />
      <PeopleView initialPeers={peers} />
    </>
  );
}
