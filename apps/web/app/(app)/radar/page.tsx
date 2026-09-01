import type { Metadata } from "next";
import { RadarView } from "@/components/app/radar-view";
import { getOpportunitiesData } from "@/lib/data/server";

export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage() {
  const opportunities = await getOpportunitiesData();

  return (
    <RadarView
      initialOpportunities={opportunities}
      nowIso={new Date().toISOString()}
    />
  );
}
