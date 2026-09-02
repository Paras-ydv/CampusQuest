"use client";

import type {
  AlignmentResponse,
  HistoricalRole,
  SimulateResponse,
} from "@campusquest/shared";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import { simulate } from "@/lib/data/client";
import { SkillConstellation } from "./skill-constellation";
import { GapList } from "./gap-list";
import { Odometer } from "@/components/motion/odometer";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Chip, Label, SegmentBar } from "@/components/ui/primitives";
import { CONSTELLATION_NODES } from "@/lib/data/skill-graph";
import { Pager, usePaged } from "@/components/ui/pager";

export function TimeMachineView({
  alignment,
  roles,
  heldIds,
}: {
  alignment: AlignmentResponse;
  roles: HistoricalRole[];
  heldIds: string[];
}) {
  const gapIds = alignment.gaps.map((g) => g.skill.id);
  // Held skills the constellation has no coordinates for, listed beneath it so
  // the "N held" count above the diagram matches what a student can see.
  const plotted = new Set(CONSTELLATION_NODES.map((node) => node.id));
  const unplotted = alignment.heldSkills.filter((skill) => !plotted.has(skill.id));

  const [selected, setSelected] = useState<string[]>([]);
  const [result, setResult] = useState<SimulateResponse | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (selected.length === 0) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setPending(true);
    simulate(selected).then((r) => {
      if (!cancelled) {
        setResult(r);
        setPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const shown = result?.toPct ?? alignment.currentPct;

  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  const pagedGaps = usePaged(alignment.gaps);
  const pagedRoles = usePaged(roles);

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ----------------------------------------------------------- header */}
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Placement Time Machine</Label>
        <WordRise
          as="h1"
          text="What did they actually ask for?"
          className="k-display max-w-[15ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={6} className="mt-6 max-w-[58ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            Measured against {alignment.roleCount} roles that recruited on campus
            between {alignment.yearsCovered}. Every figure below comes from a SQL
            query over historical postings — not from a language model, and not
            from a prediction of where you&apos;ll be placed.
          </p>
        </Reveal>
      </section>

      {/* -------------------------------------------- constellation + sim -- */}
      <div className="grid border-b-2 border-ink lg:grid-cols-[1.35fr_1fr]">
        <div className="border-b-2 border-ink px-5 py-9 lg:border-r-2 lg:border-b-0">
          <div className="mb-6 flex items-baseline justify-between gap-4">
            <Label>Your constellation</Label>
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase tabular-nums">
              {heldIds.length} held · {gapIds.length} missing
            </span>
          </div>

          <SkillConstellation
            heldIds={heldIds}
            gapIds={gapIds}
            selectedIds={selected}
            onToggle={toggle}
          />

          {/* The diagram is an authored layout, so it can only plot the skills
              it has coordinates for. A student who arrives with two dozen
              skills would otherwise see most of them counted above and none of
              them drawn, with nothing to say why. */}
          {unplotted.length ? (
            <div className="mt-6 border-t-2 border-line-soft pt-5">
              <Label className="mb-3">Also on your profile</Label>
              <div className="flex flex-wrap gap-1.5">
                {unplotted.map((skill) => (
                  <Chip key={skill.id} tone="soft" className="text-[0.625rem]">
                    {skill.name}
                  </Chip>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* ------------------------------------------------------ simulator */}
        <div className="flex flex-col px-5 py-9">
          <Label className="mb-6">What if you learned…</Label>

          <div className="flex flex-wrap gap-2">
            {alignment.gaps.map((gap) => {
              const on = selected.includes(gap.skill.id);
              return (
                <button
                  key={gap.skill.id}
                  type="button"
                  onClick={() => toggle(gap.skill.id)}
                  aria-pressed={on}
                  className={clsx(
                    "border-2 px-3.5 py-2 font-mono text-[0.72rem] tracking-[0.04em] transition-[background-color,color,border-color,transform] duration-250 hover:-translate-y-0.5",
                    on
                      ? "border-hot bg-hot text-on-hot"
                      : "border-line-soft text-muted hover:border-ink hover:text-ink",
                  )}
                >
                  {gap.skill.name}
                  <span className="ml-2 opacity-70">+{gap.impactPct}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-9">
            <div className="flex items-baseline justify-between gap-4">
              <span className="k-label">Historical alignment</span>
              {result ? (
                <span className="font-mono text-[0.6875rem] tracking-[0.1em] text-hot uppercase tabular-nums">
                  {result.fromPct}% → {result.toPct}%
                </span>
              ) : null}
            </div>

            <p className="k-display mt-2 text-[clamp(3.5rem,10vw,5.5rem)]">
              <Odometer value={shown} delay={0.05} />
              <span className="text-hot">%</span>
            </p>

            <SegmentBar
              key={shown}
              value={shown}
              segments={28}
              animate={false}
              className="mt-3"
            />
          </div>

          <div className="mt-8 min-h-[9rem] border-t-2 border-line-soft pt-6">
            <AnimatePresence mode="wait">
              {result ? (
                <motion.div
                  key={selected.join("|")}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                  className={clsx(pending && "opacity-50")}
                >
                  <dl className="flex flex-col gap-3">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="k-label">Roles newly aligned</dt>
                      <dd className="k-display text-[1.4rem] tabular-nums">
                        +{result.unlockedRoleCount}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="k-label">Opportunities unlocked</dt>
                      <dd className="k-display text-[1.4rem] tabular-nums">
                        +{result.unlockedOpportunityCount}
                      </dd>
                    </div>
                  </dl>

                  {result.unlockedRoleTitles.length > 0 ? (
                    <ul className="mt-4 flex flex-col gap-1.5">
                      {result.unlockedRoleTitles.map((t) => (
                        <li
                          key={t}
                          className="flex gap-2.5 text-[0.83rem] text-ink-2"
                        >
                          <span className="mt-2 size-1.5 shrink-0 bg-hot" />
                          {t}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </motion.div>
              ) : (
                <motion.p
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="max-w-[36ch] text-[0.86rem] leading-relaxed text-muted"
                >
                  Pick a skill above, or click a dashed square in the
                  constellation, to see what closing that gap would be worth.
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------- gaps */}
      <section className="border-b-2 border-ink px-5 py-11">
        <Label rule className="mb-7">
          Skill frequency across {alignment.roleCount} roles
        </Label>
        <GapList gaps={pagedGaps.items} />
        <Pager paged={pagedGaps} label="gaps" />
      </section>

      {/* ------------------------------------------------------------- roles */}
      <section className="px-5 py-11">
        <Label rule className="mb-7">
          The roles behind the number
        </Label>
        <div className="overflow-x-auto border-2 border-ink">
          <table className="w-full min-w-[46rem] border-collapse text-left text-[0.85rem]">
            <thead>
              <tr className="border-b-2 border-ink bg-sunk">
                {["Role", "Company", "Year", "Required", "You match"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 font-mono text-[0.625rem] font-normal tracking-[0.14em] text-muted uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRoles.items.map((role) => (
                <tr
                  key={role.id}
                  className="border-b-2 border-line-soft transition-colors duration-200 last:border-b-0 hover:bg-sunk"
                >
                  <td className="px-4 py-3 font-semibold">{role.title}</td>
                  <td className="px-4 py-3 text-muted">{role.company}</td>
                  <td className="px-4 py-3 text-muted tabular-nums">{role.year}</td>
                  <td className="px-4 py-3">
                    <span className="flex flex-wrap gap-1">
                      {role.requiredSkills.map((s) => (
                        <span
                          key={s.id}
                          className={clsx(
                            "border px-1.5 py-0.5 font-mono text-[0.625rem]",
                            heldIds.includes(s.id)
                              ? "border-ink text-ink"
                              : "border-hot text-hot",
                          )}
                        >
                          {s.name}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono font-bold tabular-nums">
                    {role.matchPct}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <Pager paged={pagedRoles} label="roles" />
        <p className="mt-3 font-mono text-[0.6875rem] tracking-[0.06em] text-faint">
          Showing {roles.length} of {alignment.roleCount} surveyed roles.
        </p>
      </section>
    </div>
  );
}
