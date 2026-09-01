import type { Metadata } from "next";
import { TimeMachineView } from "@/components/app/time-machine-view";
import { getAlignmentData, getHistoricalRolesData, getProfile } from "@/lib/data/server";

export const metadata: Metadata = { title: "Time Machine" };

export default async function TimeMachinePage() {
  const [alignment, roles, profile] = await Promise.all([
    getAlignmentData(),
    getHistoricalRolesData(),
    getProfile(),
  ]);

  return (
    <TimeMachineView
      alignment={alignment}
      roles={roles}
      heldIds={profile.skills.map((s) => s.skill.id)}
    />
  );
}
