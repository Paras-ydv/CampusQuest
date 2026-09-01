"use client";

import { clsx } from "clsx";
import type { ReactNode } from "react";

type Props = {
  items: ReactNode[];
  /** Seconds for one full loop. Larger = slower. */
  duration?: number;
  className?: string;
  separator?: ReactNode;
};

/**
 * Infinite ticker. The item list is rendered twice and the track is translated
 * by exactly -50%, so the seam is invisible. Pauses on hover so anything
 * interesting can actually be read.
 */
export function Marquee({
  items,
  duration = 42,
  className,
  separator = <span aria-hidden>◆</span>,
}: Props) {
  const run = (keyPrefix: string) =>
    items.map((item, i) => (
      <span
        key={`${keyPrefix}-${i}`}
        className="flex shrink-0 items-center gap-6 pr-6"
      >
        {item}
        <span className="opacity-40">{separator}</span>
      </span>
    ));

  return (
    <div className={clsx("k-marquee overflow-hidden", className)}>
      <div
        className="k-marquee-track"
        style={{ ["--marquee-duration" as string]: `${duration}s` }}
      >
        {/* Duplicated for the seamless -50% loop. The copy is decorative. */}
        {run("a")}
        <span aria-hidden className="flex">
          {run("b")}
        </span>
      </div>
    </div>
  );
}
