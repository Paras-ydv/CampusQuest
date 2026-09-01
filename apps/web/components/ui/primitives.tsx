import { clsx } from "clsx";
import type { ReactNode } from "react";

/* ---------------------------------------------------------------- Label --- */

/**
 * Section eyebrow. `rule` extends a 2px line to the end of the row, which is
 * how Kinetic separates every major block.
 */
export function Label({
  children,
  rule,
  className,
}: {
  children: ReactNode;
  rule?: boolean;
  className?: string;
}) {
  return (
    <div className={clsx("k-label", rule && "k-label-rule", className)}>
      <span className="shrink-0">{children}</span>
    </div>
  );
}

/* ----------------------------------------------------------------- Chip --- */

type ChipTone = "default" | "fill" | "hot" | "soft";

export function Chip({
  children,
  tone = "default",
  className,
}: {
  children: ReactNode;
  tone?: ChipTone;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "k-chip",
        tone === "fill" && "k-chip--fill",
        tone === "hot" && "k-chip--hot",
        tone === "soft" && "k-chip--soft",
        className,
      )}
    >
      {children}
    </span>
  );
}

/* ---------------------------------------------------------------- Panel --- */

export function Panel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={clsx("k-panel", className)}>{children}</div>;
}

/* --------------------------------------------------------------- Avatar --- */

const AVATAR_SIZES = {
  sm: "size-7 text-[0.625rem]",
  md: "size-9 text-xs",
  lg: "size-12 text-sm",
} as const;

export function Avatar({
  initials,
  size = "md",
  tone = "ink",
  className,
}: {
  initials: string;
  size?: keyof typeof AVATAR_SIZES;
  tone?: "ink" | "hot" | "volt";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={clsx(
        "inline-grid shrink-0 place-items-center rounded-full font-mono font-bold tracking-tight",
        AVATAR_SIZES[size],
        tone === "ink" && "bg-ink text-paper",
        tone === "hot" && "bg-hot text-on-hot",
        tone === "volt" && "bg-volt text-on-volt",
        className,
      )}
    >
      {initials}
    </span>
  );
}

/* ----------------------------------------------------------- SegmentBar --- */

/**
 * Segmented progress. Kinetic never draws a smooth bar — the segments make the
 * value countable at a glance, and each one snaps in on its own beat.
 *
 * Purely decorative: the caller states the real value in text nearby.
 */
export function SegmentBar({
  value,
  max = 100,
  segments = 26,
  className,
  animate = true,
}: {
  value: number;
  max?: number;
  segments?: number;
  className?: string;
  animate?: boolean;
}) {
  const filled = Math.round((Math.min(value, max) / max) * segments);

  return (
    <div
      aria-hidden
      className={clsx("flex gap-0.5 border-2 border-ink p-0.5", className)}
    >
      {Array.from({ length: segments }, (_, i) => (
        <span
          key={i}
          className={clsx(
            "h-2.5 flex-1 origin-left",
            i < filled ? (i >= segments - 4 ? "bg-hot" : "bg-ink") : "bg-line-soft",
            animate && "motion-safe:animate-[k-seg_0.45s_cubic-bezier(0.16,1,0.3,1)_both]",
          )}
          style={
            animate
              ? { animationDelay: `${i * 34 + 220}ms` }
              : undefined
          }
        />
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Rules --- */

export function Rule({ className }: { className?: string }) {
  return <hr className={clsx("border-0 border-t-2 border-ink", className)} />;
}
