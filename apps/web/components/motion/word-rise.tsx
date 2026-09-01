"use client";

import { Fragment, useRef } from "react";
import { motion, useInView, useReducedMotion } from "motion/react";
import { clsx } from "clsx";

type Props = {
  text: string;
  className?: string;
  /** Seconds before the first word moves. */
  delay?: number;
  /** Seconds between consecutive words. */
  stagger?: number;
  as?: "h1" | "h2" | "h3" | "p" | "div";
};

/**
 * Headline entrance: each word is clipped by its own mask and rises into place.
 * Kinetic leans on this hard — it is the page's opening gesture, so it only
 * belongs on the one headline that matters most per screen.
 *
 * The trigger watches the outer tag with useInView rather than putting
 * `whileInView` on the words themselves — each word sits inside a
 * `overflow:hidden` mask, and an IntersectionObserver on a clipped target
 * never reports itself visible, so `whileInView` on the word would deadlock.
 */
export function WordRise({
  text,
  className,
  delay = 0.1,
  stagger = 0.055,
  as = "h1",
}: Props) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLHeadingElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const Tag = motion[as];
  const words = text.split(" ");

  if (reduced) {
    const Plain = as;
    return <Plain className={className}>{text}</Plain>;
  }

  return (
    <Tag ref={ref} className={className}>
      {words.map((word, i) => (
        <Fragment key={`${word}-${i}`}>
          <span className="k-mask">
            <motion.span
              className="inline-block"
              initial={{ y: "108%" }}
              animate={inView ? { y: "0%" } : { y: "108%" }}
              transition={{
                duration: 0.85,
                delay: delay + i * stagger,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {word}
            </motion.span>
          </span>
          {i < words.length - 1 ? " " : null}
        </Fragment>
      ))}
    </Tag>
  );
}

/** Same gesture, applied to a single inline run of text. */
export function LineRise({
  children,
  className,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  if (reduced) return <span className={className}>{children}</span>;

  return (
    <span ref={ref} className={clsx("k-mask", className)}>
      <motion.span
        className="inline-block"
        initial={{ y: "108%" }}
        animate={inView ? { y: "0%" } : { y: "108%" }}
        transition={{ duration: 0.85, delay, ease: [0.16, 1, 0.3, 1] }}
      >
        {children}
      </motion.span>
    </span>
  );
}
