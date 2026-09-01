import type { ResearchMatch } from "@campusquest/shared";
import { Avatar, Chip } from "@/components/ui/primitives";
import { WhyThis } from "./why-this";

/**
 * A research match. The interesting part is the path — interest → area →
 * project → person — so the card shows which of the student's stated interests
 * produced the match rather than just asserting a score.
 */
export function ResearchCard({
  match,
  heldIds,
}: {
  match: ResearchMatch;
  heldIds: string[];
}) {
  const { project } = match;

  return (
    <article className="flex h-full flex-col border-2 border-ink bg-surface transition-[transform,box-shadow] duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-1 hover:shadow-[var(--shadow-hard)]">
      <div className="flex items-start justify-between gap-4 border-b-2 border-line-soft p-5">
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] tracking-[0.16em] text-muted uppercase">
            {project.area}
          </p>
          <h3 className="k-display mt-2 text-[1.35rem]">{project.title}</h3>
        </div>
        <span className="shrink-0 font-mono text-[0.72rem] font-bold tabular-nums text-hot">
          {match.matchPct}%
        </span>
      </div>

      <div className="flex flex-1 flex-col p-5">
        <p className="text-[0.86rem] leading-relaxed text-muted">
          {project.summary}
        </p>

        {/* ------------------------------------------------------------ lead */}
        <div className="mt-5 flex items-center gap-3 border-y-2 border-line-soft py-4">
          <Avatar initials={project.lead.initials} />
          <div className="min-w-0 flex-1">
            <p className="font-display text-[0.95rem] leading-tight font-bold tracking-[-0.02em]">
              {project.lead.name}
            </p>
            <p className="font-mono text-[0.6875rem] tracking-[0.05em] text-muted">
              {project.lead.title} · {project.lead.department}
            </p>
          </div>
          {project.lead.openToStudents ? (
            <Chip tone="hot" className="shrink-0 text-[0.625rem]">
              {project.openings} open
            </Chip>
          ) : (
            <Chip tone="soft" className="shrink-0 text-[0.625rem]">
              Closed
            </Chip>
          )}
        </div>

        {/* -------------------------------------------------------- skills */}
        <div className="mt-4">
          <p className="k-label mb-2 text-[0.625rem]">Needs</p>
          <div className="flex flex-wrap gap-1.5">
            {project.requiredSkills.map((s) => (
              <Chip
                key={s.id}
                tone={heldIds.includes(s.id) ? "fill" : "soft"}
                className="text-[0.625rem]"
              >
                {s.name}
              </Chip>
            ))}
          </div>
        </div>

        {/* --------------------------------------------------- publications */}
        {project.publications.length > 0 ? (
          <div className="mt-4">
            <p className="k-label mb-2 text-[0.625rem]">Recent work</p>
            <ul className="flex flex-col gap-1.5">
              {project.publications.map((p) => (
                <li key={p.id} className="text-[0.8rem] leading-snug text-ink-2">
                  {p.title}{" "}
                  <span className="font-mono text-[0.6875rem] text-faint">
                    {p.venue} {p.year}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="mt-auto border-t-2 border-line-soft pt-4 text-[0.82rem] leading-relaxed text-muted">
          <span className="font-semibold text-ink">Matched via</span>{" "}
          {match.viaInterests.join(", ")} — {match.why}
        </p>
      </div>

      <div className="mt-3 border-t-2 border-line-soft pt-3">
        <WhyThis
          kind="research"
          title={match.project.title}
          facts={[
            `Match score ${match.matchPct}% for this student.`,
            `Research area: ${match.project.area}, led by ${match.project.lead.name} (${match.project.lead.department}).`,
            match.viaInterests.length
              ? `Connected through the student's interests: ${match.viaInterests.join(", ")}.`
              : "No direct interest overlap.",
            `${match.project.openings} open ${match.project.openings === 1 ? "position" : "positions"}; lead ${match.project.lead.openToStudents ? "is" : "is not"} accepting students.`,
            match.project.requiredSkills.length
              ? `Skills the project calls for: ${match.project.requiredSkills.map((s) => s.name).join(", ")}.`
              : "No specific skills recorded.",
          ]}
        />
      </div>
    </article>
  );
}
