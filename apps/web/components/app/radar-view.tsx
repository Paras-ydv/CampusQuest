"use client";

import type { Difficulty, Opportunity, OpportunityKind } from "@campusquest/shared";
import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { OpportunityCard } from "./opportunity-card";
import { setOpportunitySaved } from "@/lib/data/client";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label } from "@/components/ui/primitives";
import { daysUntil } from "@/lib/format";

const KINDS: (OpportunityKind | "all")[] = [
  "all",
  "internship",
  "hackathon",
  "competition",
  "research",
  "oss",
  "workshop",
];

const DIFFICULTIES: (Difficulty | "all")[] = [
  "all",
  "intro",
  "intermediate",
  "advanced",
];

export function RadarView({
  initialOpportunities,
  nowIso,
}: {
  initialOpportunities: Opportunity[];
  nowIso: string;
}) {
  const [items, setItems] = useState(initialOpportunities);
  const [kind, setKind] = useState<OpportunityKind | "all">("all");
  const [difficulty, setDifficulty] = useState<Difficulty | "all">("all");
  const [savedOnly, setSavedOnly] = useState(false);
  const [closingSoon, setClosingSoon] = useState(false);

  const now = useMemo(() => new Date(nowIso), [nowIso]);

  const visible = useMemo(
    () =>
      items.filter((o) => {
        if (kind !== "all" && o.kind !== kind) return false;
        if (difficulty !== "all" && o.difficulty !== difficulty) return false;
        if (savedOnly && !o.saved) return false;
        if (closingSoon) {
          if (!o.deadline) return false;
          const d = daysUntil(o.deadline, now);
          if (d < 0 || d > 7) return false;
        }
        return true;
      }),
    [items, kind, difficulty, savedOnly, closingSoon, now],
  );

  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Optimistic, then reconciled. A failed write rolls the toggle back rather
   * than leaving the card claiming a save that was never persisted.
   */
  async function toggleSave(id: string, saved: boolean) {
    const previous = items;
    setSaveError(null);
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, saved } : o)));
    try {
      await setOpportunitySaved(id, saved);
    } catch (error) {
      setItems(previous);
      setSaveError(error instanceof Error ? error.message : "Could not update saved opportunities.");
    }
  }

  const urgent = items.filter(
    (o) => o.deadline && daysUntil(o.deadline, now) >= 0 && daysUntil(o.deadline, now) <= 7,
  ).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Opportunity Radar</Label>
        <WordRise
          as="h1"
          text="Everything, in one place."
          className="k-display max-w-[13ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={5} className="mt-6 max-w-[56ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            Internships, hackathons, competitions, research openings, open-source
            issues and workshops — matched against your skills and your gaps.{" "}
            {urgent > 0 ? (
              <span className="font-semibold text-hot">
                {urgent} close within a week.
              </span>
            ) : null}
          </p>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- filters */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b-2 border-ink px-5 py-5">
        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              aria-pressed={kind === k}
              className={clsx(
                "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
                kind === k
                  ? "border-ink bg-ink text-paper"
                  : "border-line-soft text-muted hover:border-ink hover:text-ink",
              )}
            >
              {k === "oss" ? "Open source" : k}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {DIFFICULTIES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDifficulty(d)}
              aria-pressed={difficulty === d}
              className={clsx(
                "font-mono text-[0.6875rem] tracking-[0.1em] uppercase transition-colors duration-200",
                difficulty === d
                  ? "text-hot underline decoration-2 underline-offset-4"
                  : "text-faint hover:text-ink",
              )}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setClosingSoon((v) => !v)}
            aria-pressed={closingSoon}
            className={clsx(
              "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
              closingSoon
                ? "border-hot bg-hot text-on-hot"
                : "border-line-soft text-muted hover:border-ink hover:text-ink",
            )}
          >
            Closing soon
          </button>
          <button
            type="button"
            onClick={() => setSavedOnly((v) => !v)}
            aria-pressed={savedOnly}
            className={clsx(
              "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
              savedOnly
                ? "border-ink bg-ink text-paper"
                : "border-line-soft text-muted hover:border-ink hover:text-ink",
            )}
          >
            Saved
          </button>
        </div>

        <span className="ml-auto font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
          {visible.length} of {items.length}
        </span>
      </section>

      <section className="px-5 py-9">
        {saveError ? (
          <p role="alert" className="mb-6 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot">
            {saveError}
          </p>
        ) : null}

        {visible.length === 0 ? (
          <p className="py-16 text-center font-mono text-[0.8rem] text-muted">
            Nothing matches those filters right now.
          </p>
        ) : (
          <motion.ul layout className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence mode="popLayout">
              {visible.map((o) => (
                <motion.li
                  key={o.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                >
                  <OpportunityCard
                    opportunity={o}
                    nowIso={nowIso}
                    onToggleSave={toggleSave}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </section>
    </div>
  );
}
