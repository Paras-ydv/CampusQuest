"use client";

import type { ResearchMatch } from "@campusquest/shared";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import { Pager, usePaged } from "@/components/ui/pager";
import { clsx } from "clsx";
import { ResearchCard } from "./research-card";
import { ConnectDialog } from "./connect-dialog";
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
  /**
   * Reaching a lead is an email, not a connection request: they have no
   * account to receive one. The note the student writes becomes the body of a
   * draft addressed to them, with the project already named in the subject so
   * the professor knows what it is about.
   */
  const [contacting, setContacting] = useState<ResearchMatch | null>(null);

  function draft(note: string) {
    const match = contacting;
    setContacting(null);
    if (!match) return;
    const subject = `Interest in your research: ${match.project.title}`;
    const body = note.trim() || `Dear ${match.project.lead.name},

I came across your work on ${match.project.title} and would like to ask about opportunities to contribute.

Thank you for your time.`;
    // Gmail's compose window rather than a `mailto:` link. A mailto hands the
    // message to whatever the operating system has registered — on Windows
    // that is an "Open Outlook?" prompt, and a student who does not use
    // Outlook has no way through it. This opens in a tab they are already
    // signed into, and it is a draft either way: the student sends it.
    const compose = new URL("https://mail.google.com/mail/");
    compose.searchParams.set("view", "cm");
    compose.searchParams.set("fs", "1");
    compose.searchParams.set("to", match.project.lead.email);
    compose.searchParams.set("su", subject);
    compose.searchParams.set("body", body);
    window.open(compose.toString(), "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <ConnectDialog
        peer={contacting && {
          name: contacting.project.lead.name,
          email: contacting.project.lead.email,
          initials: contacting.project.lead.initials,
          lookingFor: contacting.project.title,
        }}
        onCancel={() => setContacting(null)}
        onSend={draft}
        copy={{
          heading: "Email the project lead",
          action: "Open draft",
          placeholder: "Say what draws you to the project and what you could contribute.",
          context: "Project",
        }}
      />
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
                  <ResearchCard match={match} heldIds={heldIds} onConnect={setContacting} />
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
