"use client";

import type { PeerMatch } from "@campusquest/shared";
import { PeerCard } from "./peer-card";
import { ConnectDialog } from "./connect-dialog";
import { Reveal } from "@/components/motion/reveal";
import { useConnect } from "./use-connect";

/**
 * The dashboard's peer list.
 *
 * Journey is a server component, so it cannot hold the dialog state a
 * connection request needs; it rendered `PeerCard` without `onConnect`, which
 * left the Connect button inert. This is the smallest client boundary that
 * makes it work, and it uses the same hook and dialog as People so the two
 * screens cannot behave differently.
 */
export function JourneyPeers({ peers }: { peers: PeerMatch[] }) {
  const { peers: shown, connect, send, connectError, pendingPeer, cancel } = useConnect(peers);

  return (
    <>
      <ConnectDialog
        peer={
          pendingPeer && {
            name: pendingPeer.name,
            email: pendingPeer.email,
            initials: pendingPeer.initials,
            lookingFor: pendingPeer.lookingFor,
          }
        }
        onCancel={cancel}
        onSend={send}
      />

      {connectError ? (
        <p
          role="alert"
          className="mb-4 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot"
        >
          {connectError}
        </p>
      ) : null}

      <div className="flex flex-col gap-5">
        {shown.slice(0, 3).map((peer, index) => (
          <Reveal key={peer.id} index={index}>
            <PeerCard peer={peer} onConnect={connect} />
          </Reveal>
        ))}
      </div>
    </>
  );
}
