"use client";

import type { CompletedRoadmaps, SkillGap } from "@campusquest/shared";
import Link from "next/link";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { AssessmentDialog } from "@/components/app/assessment-dialog";
import { roadmapForSkill } from "@/lib/roadmap/skill-map";

/**
 * The skills historical roles kept asking for that this student doesn't hold.
 * The bar encodes frequency; the +n encodes what closing it is worth. Both
 * come from SQL, so they are safe to state as fact.
 *
 * Each gap carries the best matching resource from the warehouse catalogue, so
 * the screen answers "what do I do about it" rather than only "what is wrong".
 *
 * Where a roadmap covers the skill the row also carries an assessment, greyed
 * until that roadmap is ticked end to end. This list is where a finished
 * roadmap has something left to say — the skill is still counted against the
 * student here, and ten questions are the cheapest honest way to find out
 * whether ticking the boxes meant anything.
 */
export function GapList({ gaps, limit }: { gaps: SkillGap[]; limit?: number }) {
  const reduced = useReducedMotion();
  // The dashboard shows only the top few; the Time Machine is where the full
  // ranked list lives, and the button beneath this points there.
  const shown = limit ? gaps.slice(0, limit) : gaps;

  // One request for every roadmap the student has finished, matched against
  // the rows locally. Failure is silent and leaves every assessment greyed —
  // a list of gaps is still worth reading without it.
  const [completed, setCompleted] = useState<Set<string>>(new Set());
  const [assessing, setAssessing] = useState<{ slug: string; skillName: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/roadmap/completed", { headers: { Accept: "application/json" } });
        if (!res.ok) return;
        const body = (await res.json()) as CompletedRoadmaps;
        if (!cancelled) setCompleted(new Set(body.slugs));
      } catch {
        /* Assessments stay greyed; nothing else on the row depends on this. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      <ul className="flex flex-col">
        {shown.map((gap, i) => (
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

            <span className="col-span-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:col-span-3 sm:order-4">
              <span
                className={
                  gap.importance === "core"
                    ? "border-2 border-ink px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] uppercase"
                    : "border-2 border-line-soft px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] text-muted uppercase"
                }
              >
                {gap.importance === "core" ? "Core requirement" : "Preferred"}
              </span>

              {gap.resource ? (
                <span className="font-mono text-[0.625rem] tracking-[0.04em] text-muted">
                  Next step —{" "}
                  <span className="text-ink">{gap.resource.title}</span>{" "}
                  ({gap.resource.provider}
                  {gap.resource.estimatedHours ? `, ~${gap.resource.estimatedHours}h` : ""}
                  {gap.resource.isFree ? ", free" : ""})
                </span>
              ) : null}

              {/* Only where a roadmap honestly covers the skill — see skill-map.ts. */}
              {roadmapForSkill(gap.skill.id) ? (
                <Link
                  href={`/learn/${encodeURIComponent(gap.skill.id)}`}
                  className="font-mono text-[0.625rem] tracking-[0.08em] text-hot uppercase underline-offset-4 hover:underline"
                >
                  Learn it →
                </Link>
              ) : null}

              {/* Always shown where a roadmap exists, greyed until it is
                  ticked end to end, so the assessment reads as something the
                  roadmap leads to rather than something that appears from
                  nowhere once it is finished. */}
              {(() => {
                const link = roadmapForSkill(gap.skill.id);
                if (!link) return null;
                const ready = completed.has(link.slug);
                return (
                  <button
                    type="button"
                    disabled={!ready}
                    onClick={() => setAssessing({ slug: link.slug, skillName: gap.skill.name })}
                    title={ready ? undefined : "Finish the roadmap to unlock the assessment"}
                    className={
                      ready
                        ? "border-2 border-ink px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] uppercase transition-colors hover:bg-ink hover:text-paper"
                        : "cursor-not-allowed border-2 border-line-soft px-1.5 py-0.5 font-mono text-[0.5625rem] tracking-[0.12em] text-faint uppercase"
                    }
                  >
                    Take assessment
                  </button>
                );
              })()}
            </span>
          </li>
        ))}
      </ul>

      <AssessmentDialog target={assessing} onClose={() => setAssessing(null)} />
    </>
  );
}
