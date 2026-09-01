import type { Metadata } from "next";
import { QuestBoard } from "@/components/app/quest-board";
import { getProfile, getQuestsData } from "@/lib/data/server";

export const metadata: Metadata = { title: "Quests" };

export default async function QuestsPage() {
  const [quests, profile] = await Promise.all([getQuestsData(), getProfile()]);

  return <QuestBoard initialQuests={quests} profile={profile} />;
}
