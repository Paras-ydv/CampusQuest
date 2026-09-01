import type { Badge } from "@/lib/badges";
import { clsx } from "clsx";
import { Label } from "@/components/ui/primitives";

/**
 * Progression, shown as a professional record rather than a trophy case.
 * Locked badges stay visible with their progress so the next one is legible;
 * every count comes from real activity, not a decorative number.
 */
export function BadgeShelf({ badges }: { badges: Badge[] }) {
  if (!badges.length) return null;
  const earned = badges.filter((badge) => badge.earned).length;

  return (
    <section>
      <div className="mb-4 flex items-baseline gap-3">
        <Label>Progression</Label>
        <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
          {earned} of {badges.length} earned
        </span>
      </div>

      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {badges.map((badge) => (
          <li
            key={badge.id}
            className={clsx(
              "border-2 px-4 py-3",
              badge.earned ? "border-ink" : "border-line-soft",
            )}
          >
            <div className="flex items-baseline gap-2">
              <span
                className={clsx(
                  "size-2 shrink-0",
                  badge.earned ? "bg-hot" : "bg-line-soft",
                )}
                aria-hidden
              />
              <span
                className={clsx(
                  "font-display text-[0.95rem] font-bold tracking-[-0.02em]",
                  badge.earned ? "text-ink" : "text-muted",
                )}
              >
                {badge.name}
              </span>
              <span className="ml-auto font-mono text-[0.625rem] tracking-[0.1em] text-muted tabular-nums">
                {badge.progress}/{badge.threshold}
              </span>
            </div>

            <p className="mt-1.5 text-[0.78rem] leading-relaxed text-muted">
              {badge.description}
            </p>

            {!badge.earned ? (
              <span className="mt-2.5 block h-1 w-full bg-sunk" aria-hidden>
                <span
                  className="block h-full bg-ink/40"
                  style={{ width: `${Math.round((badge.progress / badge.threshold) * 100)}%` }}
                />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
