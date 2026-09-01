"use client";

import type { Opportunity } from "@campusquest/shared";
import { clsx } from "clsx";
import { Chip } from "@/components/ui/primitives";
import { deadlineLabel, titleCase } from "@/lib/format";

/**
 * `nowIso` is supplied by the server rather than read from the client clock:
 * "6 days left" computed during SSR and again during hydration could disagree
 * across a timezone or a midnight boundary, which React reports as a mismatch.
 */
export function OpportunityCard({
  opportunity: o,
  nowIso,
  onToggleSave,
}: {
  opportunity: Opportunity;
  nowIso: string;
  onToggleSave?: (id: string, saved: boolean) => void;
}) {
  const deadline = deadlineLabel(o.deadline, new Date(nowIso));

  return (
    <article className="group flex h-full flex-col border-2 border-ink bg-surface p-5 transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[var(--shadow-hard)]">
      <div className="flex items-start justify-between gap-3">
        <Chip tone="soft" className="text-[0.625rem]">
          {titleCase(o.kind)}
        </Chip>
        <span className="font-mono text-[0.72rem] font-bold tabular-nums text-hot">
          {o.matchPct}%
        </span>
      </div>

      <h3 className="mt-3 font-display text-[1.05rem] leading-snug font-bold tracking-[-0.025em]">
        {o.title}
      </h3>
      <p className="mt-1 font-mono text-[0.6875rem] tracking-[0.06em] text-muted">
        {o.org}
      </p>

      <p className="mt-3 flex-1 text-[0.82rem] leading-relaxed text-muted">
        {o.description}
      </p>

      {o.closesGapIds.length > 0 ? (
        <p className="mt-3 font-mono text-[0.6875rem] tracking-[0.05em] text-ok">
          Closes {o.closesGapIds.length} of your gaps
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3 border-t-2 border-line-soft pt-3">
        {deadline ? (
          <span
            className={clsx(
              "font-mono text-[0.6875rem] tracking-[0.1em] uppercase",
              deadline.urgent ? "text-hot" : "text-muted",
            )}
          >
            {deadline.text}
          </span>
        ) : (
          <span />
        )}

        {onToggleSave ? (
          <button
            type="button"
            onClick={() => onToggleSave(o.id, !o.saved)}
            aria-pressed={o.saved}
            className={clsx(
              "border-2 px-2.5 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase transition-colors duration-250",
              o.saved
                ? "border-ink bg-ink text-paper"
                : "border-line-soft text-muted hover:border-ink hover:text-ink",
            )}
          >
            {o.saved ? "Saved" : "Save"}
          </button>
        ) : (
          <span className="font-mono text-[0.625rem] tracking-[0.08em] text-faint">
            {o.saved ? "Saved" : ""}
          </span>
        )}
      </div>
    </article>
  );
}
