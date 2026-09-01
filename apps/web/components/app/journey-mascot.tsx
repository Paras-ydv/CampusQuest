"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useTheme } from "@/components/theme-provider";

/**
 * The Journey companion — a space-invader built from a fine matrix of dots.
 * Dots light up bottom-up as XP approaches the next level (the silhouette is
 * always visible as faint ghost dots). It leans toward the cursor and
 * front-flips when the theme changes — the dots are token-coloured, so the
 * flip lands already inverted.
 *
 * Purely decorative: the hero states level and XP in text. Marked aria-hidden.
 */

/** Classic 11 × 8 invader silhouette, supersampled below into a finer grid. */
const INVADER = [
  "00100000100",
  "00010001000",
  "00111111100",
  "01101110110",
  "11111111111",
  "10111111101",
  "10100000101",
  "00011011000",
];

const SCALE = 2; // -> 22 x 16 dot grid
const DOT = 4; // px
const GAP = 3; // px
const HOT_TAIL = 8; // trailing lit dots drawn in the accent colour

const COLS = INVADER[0].length * SCALE;
const ROWS = INVADER.length * SCALE;

const STAGES = [
  { name: "Seedling", max: 4 },
  { name: "Frame", max: 9 },
  { name: "Rig", max: 19 },
  { name: "Tower", max: 34 },
  { name: "Beacon", max: Number.POSITIVE_INFINITY },
];

/** Grid index -> fill order (bottom row first, then left to right); -1 = no dot. */
const ORDER: Int16Array = (() => {
  const cells: { idx: number; row: number; col: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const lit = INVADER[Math.floor(r / SCALE)][Math.floor(c / SCALE)] === "1";
      if (lit) cells.push({ idx: r * COLS + c, row: r, col: c });
    }
  }
  cells.sort((a, b) => b.row - a.row || a.col - b.col);
  const out = new Int16Array(ROWS * COLS).fill(-1);
  cells.forEach((cell, i) => {
    out[cell.idx] = i;
  });
  return out;
})();

const DOT_COUNT = ORDER.reduce((n, v) => (v >= 0 ? n + 1 : n), 0);

export function JourneyMascot({
  level,
  xp,
  xpToNext,
}: {
  level: number;
  xp: number;
  xpToNext: number;
}) {
  const reduced = useReducedMotion();
  const { resolved } = useTheme();

  const stage = STAGES.find((s) => level <= s.max) ?? STAGES[STAGES.length - 1];
  const next = STAGES[STAGES.indexOf(stage) + 1];

  const pct = Math.max(0, Math.min(1, xpToNext > 0 ? xp / xpToNext : 0));
  const lit = Math.round(pct * DOT_COUNT);

  // ---- cursor parallax ----------------------------------------------------
  const rx = useSpring(0, { stiffness: 90, damping: 16 });
  const ry = useSpring(0, { stiffness: 90, damping: 16 });
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      const nx = (e.clientX / window.innerWidth - 0.5) * 2;
      const ny = (e.clientY / window.innerHeight - 0.5) * 2;
      ry.set(nx * 10);
      rx.set(-ny * 10);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, rx, ry]);

  // ---- theme flip -------------------------------------------------------
  const [spin, setSpin] = useState(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    setSpin((s) => s + 360);
  }, [resolved, reduced]);

  return (
    <div
      aria-hidden
      className="flex flex-col items-end gap-3"
      style={{ perspective: "700px" }}
    >
      <motion.div
        animate={{ rotateX: spin }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <motion.div
          className="grid"
          style={{
            rotateX: reduced ? 0 : rx,
            rotateY: reduced ? 0 : ry,
            gridTemplateColumns: `repeat(${COLS}, ${DOT}px)`,
            gridAutoRows: `${DOT}px`,
            gap: `${GAP}px`,
          }}
        >
          {Array.from({ length: ROWS * COLS }, (_, idx) => {
            const order = ORDER[idx];
            if (order < 0) return <span key={idx} />;
            const on = order < lit;
            const hot = on && pct < 1 && order >= lit - HOT_TAIL;
            return (
              <span
                key={idx}
                className="rounded-full transition-colors duration-500 motion-safe:animate-[k-pop_0.4s_cubic-bezier(0.16,1,0.3,1)_both]"
                style={{
                  background: hot
                    ? "var(--hot)"
                    : on
                      ? "var(--ink)"
                      : "var(--faint)",
                  opacity: on ? 1 : 0.55,
                  animationDelay: `${order * 6}ms`,
                }}
              />
            );
          })}
        </motion.div>
      </motion.div>

      <span className="font-mono text-[0.625rem] tracking-[0.14em] text-muted uppercase tabular-nums">
        {stage.name} · {next ? `LV ${stage.max + 1}` : "MAX"}
      </span>
    </div>
  );
}
