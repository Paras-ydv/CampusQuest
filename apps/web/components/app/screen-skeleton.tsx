/**
 * The instant frame a route shows while its data is still being fetched.
 *
 * Without a loading boundary, Next keeps the *previous* page on screen until
 * the new server render finishes. Even at half a second that reads as a frozen
 * click; at two it reads as broken. This paints immediately, so a navigation
 * always looks like it did something.
 *
 * It deliberately mirrors the real layout — a label, a display heading, then
 * content blocks — so the swap to real content is a fill, not a jump.
 */
export function ScreenSkeleton({
  rows = 3,
  columns = 1,
}: {
  /** Content blocks to outline. */
  rows?: number;
  /** Grid width of those blocks, matching the destination screen. */
  columns?: 1 | 2 | 3;
}) {
  const grid =
    columns === 3 ? "md:grid-cols-2 xl:grid-cols-3" : columns === 2 ? "md:grid-cols-2" : "";

  return (
    <div className="mx-auto max-w-[1400px] animate-pulse px-5 py-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <span className="block h-2.5 w-24 bg-line-soft" />
      <span className="mt-5 block h-[clamp(2.2rem,7vw,4.5rem)] w-[min(34rem,90%)] bg-sunk" />
      <span className="mt-5 block h-3 w-[min(46ch,100%)] bg-line-soft" />

      <div className={`mt-12 grid gap-5 ${grid}`}>
        {Array.from({ length: rows * columns }).map((_, index) => (
          <span key={index} className="block h-40 border-2 border-line-soft bg-sunk/40" />
        ))}
      </div>
    </div>
  );
}
