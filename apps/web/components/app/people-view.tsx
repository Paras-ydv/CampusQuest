"use client";

import type { PeerMatch } from "@campusquest/shared";
import { useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { ConnectDialog } from "./connect-dialog";
import { PeerCard } from "./peer-card";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label } from "@/components/ui/primitives";
import { useConnect } from "./use-connect";

export function PeopleView({ initialPeers }: { initialPeers: PeerMatch[] }) {
  // Shared with the Journey dashboard so both screens send requests the same
  // way; Journey's Connect button was inert precisely because it did not.
  const { peers, connect, send, connectError, pendingPeer, cancel } = useConnect(initialPeers);
  const [search, setSearch] = useState("");
  const [interest, setInterest] = useState<string | null>(null);

  // Interests are derived from the results rather than hard-coded, so the
  // filter row always reflects what is actually matchable.
  const interests = useMemo(
    () =>
      Array.from(new Set(initialPeers.flatMap((p) => p.sharedInterests))).sort(),
    [initialPeers],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return peers.filter((p) => {
      if (interest && !p.sharedInterests.includes(interest)) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.branch.toLowerCase().includes(q) ||
        p.goalRole.toLowerCase().includes(q) ||
        p.lookingFor.toLowerCase().includes(q) ||
        p.complementarySkills.some((s) => s.name.toLowerCase().includes(q))
      );
    });
  }, [peers, search, interest]);

  const paged = usePaged(visible);

  return (
    <div className="mx-auto max-w-[1400px]">
      <ConnectDialog
        peer={pendingPeer && {
          name: pendingPeer.name, email: pendingPeer.email,
          initials: pendingPeer.initials, lookingFor: pendingPeer.lookingFor,
        }}
        onCancel={cancel}
        onSend={(note) => void send(note)}
      />

      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">People Matchmaker</Label>
        <WordRise
          as="h1"
          text="The teammate you're missing."
          className="k-display max-w-[14ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={5} className="mt-6 max-w-[56ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            Matched on what you don&apos;t share. Two people who both know
            PyTorch make a worse team than one who knows PyTorch and one who
            knows embedded systems — so every card leads with what they bring
            that you don&apos;t have.
          </p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- filters */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b-2 border-ink px-5 py-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, skill or intent…"
          aria-label="Search people"
          className="min-w-0 flex-1 border-2 border-ink bg-surface px-4 py-2.5 font-mono text-[0.78rem] placeholder:text-faint focus:outline-none focus-visible:border-volt sm:max-w-sm"
        />
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setInterest(null)}
            aria-pressed={interest === null}
            className={clsx(
              "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
              interest === null
                ? "border-ink bg-ink text-paper"
                : "border-line-soft text-muted hover:border-ink hover:text-ink",
            )}
          >
            All
          </button>
          {interests.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInterest(i === interest ? null : i)}
              aria-pressed={interest === i}
              className={clsx(
                "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
                interest === i
                  ? "border-ink bg-ink text-paper"
                  : "border-line-soft text-muted hover:border-ink hover:text-ink",
              )}
            >
              {i}
            </button>
          ))}
        </div>
        <span className="ml-auto font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
          {visible.length} of {peers.length}
        </span>
      </section>

      <section className="px-5 py-9">
        {connectError ? (
          <p
            role="alert"
            className="mb-6 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot"
          >
            {connectError}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <p className="py-16 text-center font-mono text-[0.8rem] text-muted">
            No complementary teammates match that yet. Add skills or interests to improve your recommendations.
          </p>
        ) : (
          <motion.ul layout className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {paged.items.map((peer) => (
                <motion.li
                  key={peer.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                >
                  <PeerCard peer={peer} onConnect={connect} />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}

        <Pager paged={paged} label="peers" />
      </section>
    </div>
  );
}
