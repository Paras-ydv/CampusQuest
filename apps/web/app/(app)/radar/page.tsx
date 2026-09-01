import type { Metadata } from "next";
import { RadarView } from "@/components/app/radar-view";
import { getOpportunities } from "@/lib/data/client";

export const metadata: Metadata = { title: "Radar" };

export default async function RadarPage() {
  const opportunities = await getOpportunities();

  return (
    <RadarView
      initialOpportunities={opportunities}
      nowIso={new Date().toISOString()}
    />
  );
}
