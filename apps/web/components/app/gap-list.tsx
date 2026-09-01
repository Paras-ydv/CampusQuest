"use client";

import type { SkillGap } from "@campusquest/shared";
import { motion, useReducedMotion } from "motion/react";

/**
 * The four skills historical roles kept asking for that this student doesn't
 * hold. The bar encodes frequency; the +n encodes what closing it is worth.
 * Both come from SQL, so they are safe to state as fact.
 */
export function GapList({ gaps }: { gaps: SkillGap[] }) {
  const reduced = useReducedMotion();

  return (
    <ul className="flex flex-col">
      {gaps.map((gap, i) => (
        <li
          key={gap.skill.id}
          className="group grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-2 border-b-2 border-line-soft py-4 last:border-b-0 sm:grid-cols-[13rem_1fr_auto]"
        >
          <span className="font-display text-[1.05rem] font-bold tracking-[-0.02em]">
            {gap.skill.name}
          </span>

          <span className="col-span-2 sm:col-span-1 sm:order-2">
            <span className="relative block h-2.5 w-full bg-sunk">
              <motion.span
                className="absolute inset-y-0 left-0 bg-ink"
                initial={reduced ? false : { scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true, amount: 0.6 }}
                transition={{
                  duration: 1,
                  delay: 0.15 + i * 0.09,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  width: `${gap.frequencyPct}%`,
                  transformOrigin: "left",
                }}
              />
            </span>
          </span>

          <span className="flex items-baseline gap-3 font-mono text-[0.72rem] tracking-[0.06em] tabular-nums sm:order-3">
            <span className="text-muted">{gap.frequencyPct}%</span>
            <span className="text-hot">+{gap.impactPct}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
