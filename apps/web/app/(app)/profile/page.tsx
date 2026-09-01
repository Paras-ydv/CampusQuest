import type { Metadata } from "next";
import { ProfileView } from "@/components/app/profile-view";
import { getBadgesData, getProfile } from "@/lib/data/server";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const [profile, badges] = await Promise.all([getProfile(), getBadgesData()]);
  return <ProfileView profile={profile} badges={badges} />;
}
