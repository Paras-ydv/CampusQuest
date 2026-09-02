"use client";

import { useEffect } from "react";

/**
 * A same-tab signal that connections changed.
 *
 * Sending or answering a request updates state that other components on the
 * page already rendered from the server. Polling eventually catches up, but a
 * request you just sent should appear at once, so the acting component
 * announces it and interested panes reload immediately.
 */
export const CONNECTIONS_CHANGED = "campusquest:connections-changed";

export function announceConnectionsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(CONNECTIONS_CHANGED));
}

/** Run `onChange` when connections change here, on focus, or every `everyMs`. */
export function useConnectionsChanged(onChange: () => void, everyMs = 15_000) {
  useEffect(() => {
    const handler = () => void onChange();
    window.addEventListener(CONNECTIONS_CHANGED, handler);
    window.addEventListener("focus", handler);
    const timer = setInterval(handler, everyMs);
    return () => {
      window.removeEventListener(CONNECTIONS_CHANGED, handler);
      window.removeEventListener("focus", handler);
      clearInterval(timer);
    };
  }, [onChange, everyMs]);
}

/**
 * A same-tab signal that the student's own profile changed.
 *
 * XP, level and skills are rendered by server components, so completing a
 * quest moved the number on the quest board while the Journey screen kept
 * showing what it had rendered at page load — the student had to reload to see
 * the XP they had just earned. The completing component announces it and any
 * screen showing profile figures refreshes.
 */
export const PROFILE_CHANGED = "campusquest:profile-changed";

export function announceProfileChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(PROFILE_CHANGED));
}

/**
 * Runs `onChange` when the profile changes here or when the tab regains focus.
 *
 * Unlike connections there is no interval: nobody else can change a student's
 * own XP, so polling would only cost requests for a value that cannot have
 * moved without this tab knowing.
 */
export function useProfileChanged(onChange: () => void) {
  useEffect(() => {
    const handler = () => void onChange();
    window.addEventListener(PROFILE_CHANGED, handler);
    window.addEventListener("focus", handler);
    return () => {
      window.removeEventListener(PROFILE_CHANGED, handler);
      window.removeEventListener("focus", handler);
    };
  }, [onChange]);
}
