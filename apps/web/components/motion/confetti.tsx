"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/**
 * A burst of paper for a moment worth marking.
 *
 * Square, hard-edged and in the three colours the rest of the app uses, rather
 * than the pastel circles a library would give — this is the same brutalist
 * kit as everything else on the page.
 *
 * A fixed, viewport-wide layer rather than something inside the panel that
 * triggered it: a dialog that clips its own overflow would otherwise clip the
 * celebration. The fall distance is measured in pixels for the same class of
 * reason — a percentage in a transform is relative to the element's own size,
 * so a 6px square told to fall "105%" travels six pixels.
 *
 * The pieces are generated once per mount and never re-randomised, so a
 * re-render cannot restart the fall halfway down. It renders nothing at all
 * under `prefers-reduced-motion`: a shower of moving objects is exactly what
 * that setting is asking not to be shown, and the result beside it already
 * says the student passed.
 */

const COLORS = ["var(--hot)", "var(--volt)", "var(--ink)"];
const PIECES = 60;

export function Confetti({ run }: { run: boolean }) {
  const reduced = useReducedMotion();

  // Measured after mount so the server render has nothing to disagree with.
  const [fall, setFall] = useState(900);
  useEffect(() => {
    setFall(window.innerHeight + 80);
  }, []);

  const pieces = useMemo(
    () =>
      Array.from({ length: PIECES }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        color: COLORS[i % COLORS.length],
        size: 6 + Math.random() * 7,
        drift: (Math.random() - 0.5) * 220,
        spin: (Math.random() - 0.5) * 900,
        delay: Math.random() * 0.4,
        duration: 1.9 + Math.random() * 1.4,
      })),
    [],
  );

  if (!run || reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((piece) => (
        <motion.span
          key={piece.id}
          className="absolute top-0 block"
          style={{
            left: `${piece.left}%`,
            width: piece.size,
            height: piece.size,
            background: piece.color,
          }}
          initial={{ y: -30, opacity: 1, rotate: 0 }}
          animate={{ y: fall, x: piece.drift, rotate: piece.spin, opacity: [1, 1, 0] }}
          transition={{
            duration: piece.duration,
            delay: piece.delay,
            ease: "easeIn",
            opacity: { duration: piece.duration, delay: piece.delay, times: [0, 0.8, 1] },
          }}
        />
      ))}
    </div>
  );
}
