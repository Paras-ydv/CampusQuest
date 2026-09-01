"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion, type Variants } from "motion/react";

/** Kinetic's one easing curve, and an accelerating counterpart for the exit. */
const EASE = [0.16, 1, 0.3, 1] as const;
const EASE_IN = [0.7, 0, 0.84, 0] as const;

// "CAMPUS" in ink, "QUEST" in hot — the same split the nav wordmark uses.
const WORD = "CAMPUSQUEST";
const HOT_FROM = 6;

const lockup: Variants = {
  hidden: {},
  intro: { transition: { staggerChildren: 0.045, delayChildren: 0.4 } },
};

const markVariants: Variants = {
  hidden: { scale: 0, rotate: -40, opacity: 0 },
  intro: { scale: 1, rotate: 0, opacity: 1, transition: { duration: 0.55, ease: EASE } },
};

const letterVariants: Variants = {
  hidden: { y: "115%" },
  intro: { y: "0%", transition: { duration: 0.6, ease: EASE } },
};

/**
 * Landing-page preloader. A square quest mark snaps in, the wordmark rises out
 * of it letter by letter, then the whole lockup scales up and fades so the
 * page behind is revealed.
 *
 * Declarative on purpose: React Strict Mode remounts effects in development, so
 * the sequence is driven by `onAnimationComplete` and a hard safety timeout
 * rather than an imperative async chain that a remount could strand.
 */
export function Preloader() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<"intro" | "exit">("intro");
  const [done, setDone] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // The overlay must never be able to strand itself over the page.
  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setDone(true), reduced ? 1200 : 4500);
    return () => clearTimeout(t);
  }, [done, reduced]);

  if (done) return null;

  if (reduced) {
    return (
      <motion.div
        aria-hidden
        className="fixed inset-0 z-[100] flex items-center justify-center bg-paper"
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.4, delay: 0.6 }}
        onAnimationComplete={() => setDone(true)}
      >
        <Lockup />
      </motion.div>
    );
  }

  return (
    <motion.div
      aria-hidden
      className="fixed inset-0 z-[100] flex items-center justify-center bg-paper"
      variants={{ exit: { scale: 1.5, opacity: 0 } }}
      initial={false}
      animate={phase === "exit" ? "exit" : false}
      transition={{ duration: 0.7, ease: EASE_IN }}
      onAnimationComplete={(definition) => {
        if (definition === "exit") setDone(true);
      }}
    >
      <motion.div
        className="flex items-center gap-2.5 md:gap-3.5"
        variants={lockup}
        initial="hidden"
        animate="intro"
        onAnimationComplete={() => {
          // Hold on the finished wordmark, then fly through it.
          window.setTimeout(() => setPhase("exit"), 420);
        }}
      >
        <Lockup />
      </motion.div>
    </motion.div>
  );
}

function Lockup() {
  return (
    <>
      <motion.svg
        variants={markVariants}
        viewBox="0 0 48 48"
        fill="none"
        className="h-[clamp(1.7rem,6.5vw,3.6rem)] w-[clamp(1.7rem,6.5vw,3.6rem)] shrink-0"
      >
        <rect x="2" y="2" width="44" height="44" stroke="var(--ink)" strokeWidth="3" />
        <path
          d="M17 12 L31 24 L17 36"
          stroke="var(--hot)"
          strokeWidth="5"
          strokeLinecap="square"
          strokeLinejoin="miter"
        />
      </motion.svg>

      <span className="flex">
        {WORD.split("").map((ch, i) => (
          <span key={i} className="k-mask">
            <motion.span
              variants={letterVariants}
              className="k-display inline-block text-[clamp(2rem,8vw,4.5rem)]"
              style={{ color: i >= HOT_FROM ? "var(--hot)" : "var(--ink)" }}
            >
              {ch}
            </motion.span>
          </span>
        ))}
      </span>
    </>
  );
}
