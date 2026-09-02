"use client";

import { useRef, useState } from "react";
import { clsx } from "clsx";
import type { AtsScore, AtsState } from "@campusquest/shared";
import { Button } from "@/components/ui/button";
import { Chip, Label } from "@/components/ui/primitives";
import { Reveal } from "@/components/motion/reveal";

/**
 * The ATS screen.
 *
 * The score is HackerRank's rubric out of 120, but the page is ordered for the
 * person being scored rather than for a recruiter: what to fix comes first and
 * the number sits beside it as context. A student who opens this to a verdict
 * stops reading; one who opens it to four specific changes has something to do.
 */

const CATEGORY_LABELS: Record<string, string> = {
  openSource: "Open source",
  selfProjects: "Projects",
  production: "Experience",
  technicalSkills: "Technical skills",
};

/** Rubric category names as they appear on an improvement. */
const IMPROVEMENT_LABELS: Record<string, string> = {
  open_source: "Open source",
  self_projects: "Projects",
  production: "Experience",
  technical_skills: "Technical skills",
};

function ScoreBar({ score, max }: { score: number; max: number }) {
  const pct = Math.round((score / max) * 100);
  return (
    <span className="relative block h-1.5 w-full bg-sunk">
      <span
        className={clsx("absolute inset-y-0 left-0", pct >= 60 ? "bg-ok" : pct >= 30 ? "bg-ink" : "bg-hot")}
        style={{ width: `${Math.max(pct, 2)}%` }}
      />
    </span>
  );
}

export function AtsView({ initial }: { initial: AtsState }) {
  const [state, setState] = useState<AtsState>(initial);
  const [scoring, setScoring] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const score: AtsScore | null = state.score;

  /** Reads the specific validation message the API returns, not the generic one. */
  async function failure(response: Response, fallback: string): Promise<string> {
    const body = await response.json().catch(() => null);
    const detail = Array.isArray(body?.details) ? body.details[0]?.message : null;
    return detail ?? body?.message ?? fallback;
  }

  async function runScore() {
    setScoring(true);
    setError(null);
    try {
      const response = await fetch("/api/ats", { method: "POST" });
      if (!response.ok) throw new Error(await failure(response, "Could not score your résumé."));
      const next = (await response.json()) as AtsScore;
      setState((current) => ({ ...current, score: next }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not score your résumé.");
    } finally {
      setScoring(false);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const body = new FormData();
      body.append("resume", file);
      const response = await fetch("/api/ats/resume", { method: "POST", body });
      if (!response.ok) throw new Error(await failure(response, "Could not read that résumé."));
      setState((await response.json()) as AtsState);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not read that résumé.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[64rem] px-5 py-10 md:py-14">
      <Label className="mb-4">ATS score</Label>
      <h1 className="k-display text-[clamp(1.9rem,5vw,3rem)]">
        How a screener
        <br />
        reads your résumé.
      </h1>
      <p className="mt-5 max-w-[54ch] text-[0.92rem] leading-relaxed text-muted">
        Scored on the rubric HackerRank uses for intern applications — open
        source, projects, experience and technical skills, out of 120. The
        number is context; the changes below it are the point.
      </p>

      {/* -------------------------------------------------- no résumé yet -- */}
      {!state.hasResume ? (
        <div className="mt-10 border-2 border-dashed border-line-soft px-6 py-12 text-center">
          <p className="k-label">No résumé on file</p>
          <p className="mx-auto mt-3 max-w-[42ch] text-[0.88rem] leading-relaxed text-muted">
            Upload a PDF to score it. We keep only the text we read from it, never
            the file, and you can replace it any time.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <div className="mt-7">
            <Button onClick={() => inputRef.current?.click()} disabled={uploading} size="md">
              {uploading ? "Reading…" : "Choose a PDF"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-10 flex flex-wrap items-center gap-4 border-t-2 border-ink pt-6">
          <div className="flex-1">
            <p className="k-label">{state.fileName ?? "Your résumé"}</p>
            {/* No "scored on <date>": the score is always of the résumé shown
                above it, so the date says nothing a student needs. Staleness
                does matter, and is called out on its own. */}
            {score?.stale ? (
              <p className="mt-1.5 font-mono text-[0.6875rem] tracking-[0.06em] text-muted">
                Your résumé changed since this score — score again
              </p>
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
              event.target.value = "";
            }}
          />
          <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? "Reading…" : "Replace"}
          </Button>
          <Button onClick={runScore} disabled={scoring} size="md" variant={score ? "outline" : "hot"} arrow>
            {scoring ? "Scoring…" : score ? "Score again" : "Score my résumé"}
          </Button>
        </div>
      )}

      {error ? (
        <p role="alert" className="mt-6 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot">
          {error}
        </p>
      ) : null}

      {scoring ? (
        <p className="mt-8 font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
          Reading your résumé against the rubric…
        </p>
      ) : null}

      {/* ------------------------------------------------------- results -- */}
      {score ? (
        <div className="mt-12">
          {/* Improvements lead: they are what the student can act on. */}
          {score.improvements.length ? (
            <Reveal>
              <Label rule className="mb-5">What would move it</Label>
              <ol className="border-t-2 border-ink">
                {score.improvements.map((item, index) => (
                  <li key={`${item.title}-${index}`} className="grid gap-2 border-b-2 border-line-soft py-5 sm:grid-cols-[2.5rem_1fr_5rem] sm:gap-4">
                    <span className="font-mono text-[0.72rem] tabular-nums text-muted">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="text-[0.95rem] font-bold">{item.title}</p>
                      {item.detail ? (
                        <p className="mt-1.5 text-[0.86rem] leading-relaxed text-muted">{item.detail}</p>
                      ) : null}
                      <Chip tone="soft" className="mt-2.5 text-[0.625rem]">
                        {IMPROVEMENT_LABELS[item.category] ?? item.category}
                      </Chip>
                    </div>
                    {item.points > 0 ? (
                      <span className="font-mono text-[0.8rem] font-bold tabular-nums text-ok sm:text-right">
                        +{item.points}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Reveal>
          ) : null}

          {/* The number and its breakdown, after the actions. */}
          <Reveal>
            <div className="mt-14 border-2 border-ink p-6">
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-display text-[3rem] leading-none font-bold tabular-nums">{score.overall}</span>
                <span className="font-mono text-[0.8rem] tracking-[0.1em] text-muted">/ 120</span>
              </div>

              <dl className="mt-8 grid gap-5 sm:grid-cols-2">
                {Object.entries(score.categories).map(([key, category]) => (
                  <div key={key}>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="k-label">{CATEGORY_LABELS[key] ?? key}</dt>
                      <dd className="font-mono text-[0.72rem] tabular-nums">
                        {category.score}/{category.max}
                      </dd>
                    </div>
                    <div className="mt-2">
                      <ScoreBar score={category.score} max={category.max} />
                    </div>
                    <p className="mt-2 text-[0.8rem] leading-relaxed text-muted">{category.evidence}</p>
                  </div>
                ))}
              </dl>

              {/* Shown only when there is something to report. A zero line
                  reading "None." is noise, and an adjustment with no reason is
                  worse — the evaluator drops those rather than pass them on. */}
              {score.bonus.total > 0 || score.deductions.total > 0 ? (
                <div className="mt-7 grid gap-3 border-t-2 border-line-soft pt-5 text-[0.82rem] text-muted sm:grid-cols-2">
                  {score.bonus.total > 0 ? (
                    <p>
                      <span className="k-label mr-2">Bonus</span>
                      <span className="text-ok">+{score.bonus.total}</span> · {score.bonus.breakdown}
                    </p>
                  ) : null}
                  {score.deductions.total > 0 ? (
                    <p>
                      <span className="k-label mr-2">Deductions</span>
                      <span className="text-hot">−{score.deductions.total}</span> · {score.deductions.reasons}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </Reveal>

          {score.strengths.length ? (
            <Reveal>
              <div className="mt-12">
                <Label rule className="mb-5">What is already working</Label>
                <ul className="grid gap-2.5">
                  {score.strengths.map((strength, index) => (
                    <li key={index} className="border-l-2 border-ok pl-3 text-[0.88rem] leading-relaxed text-ink-2">
                      {strength}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          ) : null}

          <p className="mt-12 max-w-[58ch] text-[0.82rem] leading-relaxed text-faint">
            This is one rubric&apos;s reading of one document, not a judgement of
            you. It scores what the résumé evidences — a real project with no link
            scores as though it were not there, which is exactly the problem worth
            fixing.
          </p>
        </div>
      ) : null}
    </div>
  );
}
