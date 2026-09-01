"use client";

import type { PeerMatch } from "@campusquest/shared";
import { clsx } from "clsx";
import { Avatar, Chip } from "@/components/ui/primitives";
import { WhyThis } from "./why-this";

const CONNECTION_COPY: Record<PeerMatch["connection"], string> = {
  none: "Connect",
  outgoing: "Requested",
  incoming: "Respond",
  connected: "Connected",
};

/**
 * A peer match. The card leads with what they bring that you don't — the whole
 * argument for the match is complementarity, so that has to be the loudest
 * thing on it after the name.
 *
 * `onConnect` is optional: the dashboard renders these read-only, the People
 * screen wires the button up.
 */
export function PeerCard({
  peer,
  onConnect,
}: {
  peer: PeerMatch;
  onConnect?: (peerId: string) => void;
}) {
  const actionable = peer.connection === "none" && !!onConnect;

  return (
    <article className="group flex h-full flex-col border-2 border-ink bg-surface p-5 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[var(--shadow-hard)]">
      <div className="flex items-start gap-3">
        <Avatar initials={peer.initials} />
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-[1.02rem] leading-tight font-bold tracking-[-0.02em]">
            {peer.name}
          </h3>
          <p className="font-mono text-[0.6875rem] tracking-[0.06em] text-muted">
            {peer.branch} · Year {peer.year}
          </p>
        </div>
        <span className="shrink-0 font-mono text-[0.72rem] font-bold tabular-nums text-hot">
          {peer.matchPct}%
        </span>
      </div>

      <div className="mt-4">
        <p className="k-label mb-2 text-[0.625rem]">They bring</p>
        <div className="flex flex-wrap gap-1.5">
          {peer.complementarySkills.map((s) => (
            <Chip key={s.id} tone="fill" className="text-[0.625rem]">
              {s.name}
            </Chip>
          ))}
        </div>
      </div>

      <p className="mt-4 flex-1 text-[0.82rem] leading-relaxed text-muted">
        {peer.why}
      </p>

      <p className="mt-4 border-t-2 border-line-soft pt-3 font-mono text-[0.6875rem] tracking-[0.05em] text-ink-2">
        Looking for — {peer.lookingFor}
      </p>

      <button
        type="button"
        disabled={!actionable}
        onClick={actionable ? () => onConnect(peer.id) : undefined}
        className={clsx(
          "mt-4 w-full border-2 py-2.5 font-mono text-[0.6875rem] font-bold tracking-[0.14em] uppercase transition-colors duration-300",
          actionable
            ? "border-ink bg-transparent text-ink hover:bg-ink hover:text-paper"
            : peer.connection === "none"
              ? "border-ink text-ink"
              : "border-line-soft text-faint",
        )}
      >
        {CONNECTION_COPY[peer.connection]}
      </button>

      <div className="mt-3 border-t-2 border-line-soft pt-3">
        <WhyThis
          kind="person"
          title={peer.name}
          facts={[
            `Match score ${peer.matchPct}% for this student.`,
            peer.complementarySkills.length
              ? `Skills they bring that the student lacks: ${peer.complementarySkills.map((s) => s.name).join(", ")}.`
              : "No complementary skills recorded.",
            peer.youBring.length
              ? `Skills the student brings that they lack: ${peer.youBring.map((s) => s.name).join(", ")}.`
              : "The student brings no skills they lack.",
            peer.sharedInterests.length ? `Shared interests: ${peer.sharedInterests.join(", ")}.` : "No shared interests.",
            `They are looking for: ${peer.lookingFor}.`,
          ]}
        />
      </div>
    </article>
  );
}
