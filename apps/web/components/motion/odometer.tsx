"use client";

import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";
import { clsx } from "clsx";

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

type Props = {
  value: number;
  className?: string;
  /** Seconds before the first column starts rolling. */
  delay?: number;
  /** Seconds added per column, left to right. */
  stagger?: number;
  locale?: string;
};

/**
 * Rolling-digit counter. Every column starts at zero and rolls up to its final
 * digit, so the figure reads as "0,000 → 2,340" rather than fading in.
 *
 * Re-renders animate too: pass a new `value` after a quest completes and the
 * affected columns roll to their new digits.
 */
export function Odometer({
  value,
  className,
  delay = 0.25,
  stagger = 0.07,
  locale = "en-US",
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const reduced = useReducedMotion();

  const chars = Math.round(value).toLocaleString(locale).split("");

  if (reduced) {
    return (
      <span ref={ref} className={clsx("tnum", className)}>
        {chars.join("")}
      </span>
    );
  }

  let digitIndex = -1;

  return (
    <span ref={ref} className={clsx("inline-flex leading-none tnum", className)}>
      {/* The visible figure is built from stacked columns, which reads as
          "0123456789" to a screen reader. Expose the real number instead. */}
      <span className="sr-only">{chars.join("")}</span>
      {chars.map((char, i) => {
        if (!/\d/.test(char)) {
          return (
            <span key={`sep-${i}`} aria-hidden className="inline-block">
              {char}
            </span>
          );
        }
        digitIndex += 1;
        const target = Number(char);
        const columnDelay = delay + digitIndex * stagger;

        return (
          <span
            key={`d-${i}`}
            aria-hidden
            className="inline-block h-[1em] overflow-hidden"
          >
            <motion.span
              className="block"
              initial={{ y: "0em" }}
              animate={inView ? { y: `-${target}em` } : { y: "0em" }}
              transition={{
                duration: 1.5,
                delay: columnDelay,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
