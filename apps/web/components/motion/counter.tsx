"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { clsx } from "clsx";

type Props = {
  value: number;
  className?: string;
  durationMs?: number;
  delayMs?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
};

/**
 * Plain count-up for stat tiles, where the odometer would be too loud.
 * Runs on rAF rather than a motion value so the DOM text node is the only
 * thing that changes.
 */
export function Counter({
  value,
  className,
  durationMs = 1300,
  delayMs = 150,
  suffix = "",
  prefix = "",
  decimals = 0,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setDisplay(value);
      return;
    }
    if (!inView) return;

    let raf = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (t: number) => {
        if (!start) start = t;
        const p = Math.min(1, (t - start) / durationMs);
        // Quartic ease-out: fast commit, long settle — matches --ease-kinetic.
        setDisplay(value * (1 - Math.pow(1 - p, 4)));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [inView, value, durationMs, delayMs, reduced]);

  const text = decimals
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString("en-US");

  return (
    <span ref={ref} className={clsx("tnum", className)}>
      {prefix}
      {text}
      {suffix}
    </span>
  );
}
