"use client";

import type { ResearchMatch } from "@campusquest/shared";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { clsx } from "clsx";
import { ResearchCard } from "./research-card";
import { Label } from "@/components/ui/primitives";

/**
 * The Research screen was a static list: no way to narrow by area, find a
 * particular group, or see only the projects actually taking students. With 42
 * projects across fifteen areas that is a wall of cards rather than a tool.
 *
 * Filtering happens client-side because the whole matched set is already on the
 * page — the ranking and every percentage came from the warehouse server-side,
 * and none of it is recomputed here.
 */
export function ResearchView({
  matches,
  heldIds,
  interests,
}: {
  matches: ResearchMatch[];
  heldIds: string[];
  interests: string[];
}) {
  const [area, setArea] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [acceptingOnly, setAcceptingOnly] = useState(false);

  // Areas come from the results, so the filter row can never offer an empty one.
  const areas = useMemo(
    () => [...new Set(matches.map((m) => m.project.area))].sort(),
    [matches],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return matches.filter((m) => {
      const { project } = m;
      if (area && project.area !== area) return false;
      if (openOnly && project.openings < 1) return false;
      if (acceptingOnly && !project.lead.openToStudents) return false;
      if (!q) return true;
      return (
        project.title.toLowerCase().includes(q) ||
        project.area.toLowerCase().includes(q) ||
        project.lead.name.toLowerCase().includes(q) ||
        project.lead.department.toLowerCase().includes(q) ||
        project.requiredSkills.some((s) => s.name.toLowerCase().includes(q)) ||
        project.publications.some((p) => p.title.toLowerCase().includes(q))
      );
    });
  }, [matches, area, search, openOnly, acceptingOnly]);

  const openCount = matches.filter((m) => m.project.openings > 0).length;

  const toggle = (active: boolean) =>
    clsx(
      "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
      active ? "border-ink bg-ink text-paper" : "border-line-soft text-muted hover:border-ink hover:text-ink",
    );


  const paged = usePaged(visible);
  return (
    <>
      <section className="flex flex-wrap items-center gap-3 border-b-2 border-ink px-5 py-5">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search projects, professors, areas"
          aria-label="Search research"
          className="min-w-[14rem] flex-1 border-2 border-line-soft bg-transparent px-3 py-2 font-mono text-[0.75rem] placeholder:text-faint focus:border-ink focus:outline-none"
        />
        <button type="button" onClick={() => setOpenOnly((v) => !v)} aria-pressed={openOnly} className={toggle(openOnly)}>
          Has openings ({openCount})
        </button>
        <button
          type="button"
          onClick={() => setAcceptingOnly((v) => !v)}
          aria-pressed={acceptingOnly}
          className={toggle(acceptingOnly)}
        >
          Accepting students
        </button>
        <span className="ml-auto font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase tabular-nums">
          {visible.length} of {matches.length}
        </span>
      </section>

      <section className="flex flex-wrap items-center gap-2 border-b-2 border-line-soft px-5 py-4">
        <button type="button" onClick={() => setArea(null)} aria-pressed={area === null} className={toggle(area === null)}>
          All areas
        </button>
        {areas.map((a) => (
          <button key={a} type="button" onClick={() => setArea(area === a ? null : a)} aria-pressed={area === a} className={toggle(area === a)}>
            {a}
          </button>
        ))}
      </section>

      <section className="px-5 py-9">
        <Label rule className="mb-7">
          {area ? `${area} — ` : ""}
          {visible.length} {visible.length === 1 ? "project" : "projects"} near{" "}
          {interests.slice(0, 3).join(", ") || "your interests"}
        </Label>

        {visible.length === 0 ? (
          <p className="py-16 text-center font-mono text-[0.8rem] text-muted">
            No projects match those filters. Try a broader area or clear the
            search.
          </p>
        ) : (
          <motion.div layout className="grid gap-5 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {paged.items.map((match) => (
                <motion.div
                  key={match.project.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                  className="h-full"
                >
                  <ResearchCard match={match} heldIds={heldIds} />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        )}

        <Pager paged={paged} label="projects" />
      </section>
    </>
  );
}
