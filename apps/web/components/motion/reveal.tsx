"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  /** Stagger position. Each step adds 60ms. */
  index?: number;
  /** Extra delay in seconds, on top of the index stagger. */
  delay?: number;
  /** Travel distance in px. Negative values enter from above. */
  y?: number;
  x?: number;
  className?: string;
  /** Fire as soon as this much of the element is visible. */
  amount?: number;
  once?: boolean;
};

/**
 * The app's default entrance: a short rise with a long, decelerating tail.
 * Everything on a page should enter through this so the timing feels like one
 * system rather than a pile of separate animations.
 */
export function Reveal({
  children,
  index = 0,
  delay = 0,
  y = 18,
  x = 0,
  className,
  amount = 0.25,
  once = true,
}: Props) {
  const reduced = useReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y, x }}
      whileInView={{ opacity: 1, y: 0, x: 0 }}
      viewport={{ once, amount }}
      transition={{
        duration: 0.75,
        delay: index * 0.06 + delay,
        ease: [0.16, 1, 0.3, 1],
      }}
    >
      {children}
    </motion.div>
  );
}
