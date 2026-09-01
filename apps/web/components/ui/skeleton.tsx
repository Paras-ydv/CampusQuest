import { clsx } from "clsx";

/**
 * Placeholder for content still streaming in.
 *
 * Kinetic has no soft shapes, so a skeleton is a flat `--sunk` block on the
 * same 2px grid as the thing it stands in for — never a rounded pill. The pulse
 * is `motion-safe:` because the global reduced-motion rule flattens animation
 * durations rather than removing them.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={clsx("block bg-sunk motion-safe:animate-pulse", className)}
    />
  );
}

/** A skeleton in place of a bordered card, matching `k-panel`'s hard edge. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={clsx("border-2 border-line-soft p-5", className)}>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-4 h-6 w-3/4" />
      <Skeleton className="mt-2.5 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-5/6" />
    </div>
  );
}

/**
 * Announces to assistive technology that a region is still loading. The visual
 * skeletons are `aria-hidden`, so without this a screen reader hears nothing at
 * all while a section streams.
 */
export function LoadingRegion({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
