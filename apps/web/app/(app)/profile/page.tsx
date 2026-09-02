import type { Metadata } from "next";
import { ProfileRefresh } from "@/components/app/profile-refresh";
import { ProfileView } from "@/components/app/profile-view";
import { getBadgesData, getProfile } from "@/lib/data/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const [profile, badges] = await Promise.all([getProfile(), getBadgesData()]);
  return (
    <>
      {/* Quest completions change XP, level and skills, all rendered here from
          the server. */}
      <ProfileRefresh />
      <ProfileView profile={profile} badges={badges} />
    </>
  );
}
