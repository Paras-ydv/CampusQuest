"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { PeerMatch } from "@campusquest/shared";
import { announceConnectionsChanged } from "@/lib/live-refresh";

/**
 * The connect flow shared by every screen that lists peers.
 *
 * People and the Journey dashboard both send connection requests, and the
 * sending is not trivial: the card has to move to "outgoing" immediately, roll
 * back if the request fails, and tell the server-rendered requests section to
 * refresh. Duplicating that in two places is how the two screens drift apart —
 * which is exactly what happened when Journey shipped with a Connect button
 * wired to nothing.
 */
export function useConnect(initialPeers: PeerMatch[]) {
  const router = useRouter();
  const [peers, setPeers] = useState(initialPeers);
  const [pendingPeerId, setPendingPeerId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  /** Opening the dialog is the first half; `send` is the second. */
  function connect(peerId: string) {
    setPendingPeerId(peerId);
  }

  async function send(note: string) {
    const peerId = pendingPeerId;
    if (!peerId) return;
    setPendingPeerId(null);

    // Optimistic, but reversible: the card must never be left claiming a
    // connection the server did not accept.
    const previous = peers;
    setConnectError(null);
    setPeers((prev) => prev.map((peer) => (peer.id === peerId ? { ...peer, connection: "outgoing" } : peer)));

    try {
      const response = await fetch("/api/people/connection-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peerId, message: note.trim() || undefined }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Could not send the request (${response.status}).`);
      }
      // The requests section is server-rendered, so without this the request
      // just sent does not appear until the page is reloaded.
      announceConnectionsChanged();
      router.refresh();
    } catch (error) {
      setPeers(previous);
      setConnectError(error instanceof Error ? error.message : "Could not send the request.");
    }
  }

  return {
    peers,
    setPeers,
    connect,
    send,
    connectError,
    pendingPeer: peers.find((peer) => peer.id === pendingPeerId) ?? null,
    cancel: () => setPendingPeerId(null),
  };
}
