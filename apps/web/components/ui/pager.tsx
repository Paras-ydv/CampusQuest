"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";

/**
 * ===========================================================================
 *  PAGINATION
 * ===========================================================================
 * Every list screen shows the same number of rows before it asks you to page,
 * so moving between Radar, People, Quests and Research feels like one system
 * rather than four screens with their own ideas about length.
 */
export const PAGE_SIZE = 8;

export type Paged<T> = {
  items: T[];
  page: number;
  pageCount: number;
  setPage: (page: number) => void;
  /** 1-based index of the first row on this page, or 0 when there are none. */
  from: number;
  to: number;
  total: number;
};

/**
 * Slices a filtered list into pages.
 *
 * The page resets when the *number* of matches changes, which is what a filter
 * change looks like. It deliberately does not reset on every new array
 * identity: saving an opportunity or connecting with a peer rebuilds the list
 * without changing its length, and bouncing the reader back to page one for
 * that would be maddening.
 */
export function usePaged<T>(source: T[], pageSize: number = PAGE_SIZE): Paged<T> {
  const [page, setPage] = useState(1);
  const total = source.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [total]);

  // Clamped rather than corrected in state: a shrinking list must not leave the
  // reader on a page that no longer exists, and doing it here avoids a render
  // where `items` is empty before an effect catches up.
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;

  const items = useMemo(
    () => source.slice(start, start + pageSize),
    [source, start, pageSize],
  );

  return {
    items,
    page: current,
    pageCount,
    setPage,
    from: total === 0 ? 0 : start + 1,
    to: Math.min(start + pageSize, total),
    total,
  };
}

/** Page numbers with ellipses, never more than seven slots wide. */
function pageWindow(page: number, pageCount: number): (number | "gap")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const out: (number | "gap")[] = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);
  if (from > 2) out.push("gap");
  for (let i = from; i <= to; i += 1) out.push(i);
  if (to < pageCount - 1) out.push("gap");
  out.push(pageCount);
  return out;
}

/**
 * The control itself. Renders nothing for a single page — a pager under a list
 * that fits on one screen is just noise.
 */
export function Pager<T>({
  paged,
  label,
  className,
}: {
  paged: Paged<T>;
  /** Plural noun for the screen reader summary, e.g. "opportunities". */
  label: string;
  className?: string;
}) {
  const { page, pageCount, setPage, from, to, total } = paged;
  if (pageCount <= 1) return null;

  const step = (next: number) => setPage(Math.min(pageCount, Math.max(1, next)));

  return (
    <nav
      aria-label={`${label} pagination`}
      className={clsx(
        "mt-8 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t-2 border-line-soft pt-5",
        className,
      )}
    >
      <p className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
        {from}–{to} of {total} {label}
      </p>

      <div className="flex items-center gap-1.5">
        <PagerButton onClick={() => step(page - 1)} disabled={page === 1} label="Previous page">
          ←
        </PagerButton>

        {pageWindow(page, pageCount).map((slot, i) =>
          slot === "gap" ? (
            <span
              key={`gap-${i}`}
              aria-hidden
              className="px-1 font-mono text-[0.6875rem] text-faint"
            >
              …
            </span>
          ) : (
            <PagerButton
              key={slot}
              onClick={() => step(slot)}
              current={slot === page}
              label={`Page ${slot}`}
            >
              {slot}
            </PagerButton>
          ),
        )}

        <PagerButton onClick={() => step(page + 1)} disabled={page === pageCount} label="Next page">
          →
        </PagerButton>
      </div>
    </nav>
  );
}

function PagerButton({
  children,
  onClick,
  disabled,
  current,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  current?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-current={current ? "page" : undefined}
      className={clsx(
        "grid size-8 place-items-center border-2 font-mono text-[0.6875rem] tabular-nums",
        "transition-colors duration-200",
        current
          ? "border-ink bg-ink text-paper"
          : "border-line-soft text-muted hover:border-ink hover:text-ink",
        disabled && "cursor-not-allowed opacity-35 hover:border-line-soft hover:text-muted",
      )}
    >
      {children}
    </button>
  );
}
