"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useProfileChanged } from "@/lib/live-refresh";

/**
 * Re-renders a server component when the student's profile changes.
 *
 * XP, level and skills are read during render, so a screen that shows them
 * keeps its page-load values however long it stays open — completing a quest
 * moved the number on the quest board while the Journey screen went on showing
 * the old one until the student reloaded.
 *
 * This renders nothing. It exists so a server-rendered page can react to a
 * client-side event without becoming a client component itself, which would
 * mean fetching everything it currently gets during render.
 */
export function ProfileRefresh() {
  const router = useRouter();
  // `router.refresh` is stable, but the hook takes a callback and re-subscribes
  // when it changes; wrapping keeps that subscription from churning.
  useProfileChanged(useCallback(() => router.refresh(), [router]));
  return null;
}
