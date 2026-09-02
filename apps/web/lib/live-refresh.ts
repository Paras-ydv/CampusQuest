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
