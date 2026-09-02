"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { clsx } from "clsx";
import type { Assessment, AssessmentResult } from "@campusquest/shared";
import { Confetti } from "@/components/motion/confetti";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";

/**
 * The check a student can take once a roadmap is fully ticked.
 *
 * Ten questions, written for the subject of that roadmap, marked on the server.
 * Nothing here knows the answers until the result comes back: passing adds the
 * skill and awards experience, and a test that pays cannot ship its own key to
 * the browser. The review below the result is drawn from `result.answers`,
 * which the server sends only once the attempt is in.
 *
 * Every attempt is generated fresh, so retaking is not a memory test of the
 * previous set.
 */

type Target = { slug: string; skillName: string } | null;

type Phase =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; assessment: Assessment };

export function AssessmentDialog({ target, onClose }: { target: Target; onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ kind: "loading" });
  // Question id → chosen option index. Absent until the student picks one, so
  // "unanswered" and "answered with the first option" cannot be confused.
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [grading, setGrading] = useState(false);
  const [gradeError, setGradeError] = useState<string | null>(null);

  const generate = useCallback(async (slug: string) => {
    setPhase({ kind: "loading" });
    setAnswers({});
    setResult(null);
    setGradeError(null);
    try {
      const res = await fetch(`/api/roadmap/${encodeURIComponent(slug)}/assessment`, {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "The assessment could not be generated right now.",
        );
      }
      setPhase({ kind: "ready", assessment: body as Assessment });
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : "The assessment could not be generated.",
      });
    }
  }, []);

  // Keyed on the slug, not on `target`, and kept apart from the key handler
  // below. Both matter: `target` and `onClose` are fresh objects on every
  // parent render, and a generate effect that watched them would throw away a
  // half-finished attempt the first time anything above re-rendered.
  const slug = target?.slug ?? null;
  useEffect(() => {
    if (slug) void generate(slug);
  }, [slug, generate]);

  useEffect(() => {
    if (!target) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [target, onClose]);

  const submit = useCallback(async () => {
    if (phase.kind !== "ready") return;
    setGrading(true);
    setGradeError(null);
    try {
      const res = await fetch(
        `/api/roadmap/${encodeURIComponent(phase.assessment.slug)}/assessment/grade`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({ token: phase.assessment.token, answers }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body?.message === "string"
            ? body.message
            : "The attempt could not be marked. It may have expired — try a new set.",
        );
      }
      const marked = body as AssessmentResult;
      setResult(marked);
      // A pass writes a skill and experience, which the gap list, the level
      // badge and the alignment score behind this dialog are all rendered from.
      if (marked.passed) router.refresh();
    } catch (error) {
      setGradeError(error instanceof Error ? error.message : "The attempt could not be marked.");
    } finally {
      setGrading(false);
    }
  }, [answers, phase, router]);

  const questions = phase.kind === "ready" ? phase.assessment.questions : [];
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const passMark = phase.kind === "ready" ? phase.assessment.passMark : 80;

  // The key, by question id, once the server has sent it back.
  const key = useMemo(
    () => new Map((result?.answers ?? []).map((answer) => [answer.id, answer])),
    [result],
  );

  return (
    <AnimatePresence>
      {target ? (
        <>
          {/* A sibling of the panel, not a child. The panel is centred with
              `-translate-x-1/2`, and a transformed ancestor becomes the
              containing block for `position: fixed` — inside it the burst
              would be confined to the dialog's own box. */}
          <Confetti run={result?.passed === true} />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-ink/35 backdrop-blur-[2px]"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={`${target.skillName} assessment`}
            initial={{ opacity: 0, y: 12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-1/2 left-1/2 z-50 flex max-h-[86vh] w-[min(42rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border-2 border-ink bg-paper shadow-[var(--shadow-hard)]"
          >
            {/* Sits above the panel and takes no clicks — see confetti.tsx. */}
            <Confetti run={result?.passed === true} />

            <div className="flex items-baseline justify-between gap-4 border-b-2 border-ink px-5 py-4">
              <Label>{target.skillName} assessment</Label>
              <span className="font-mono text-[0.625rem] tracking-[0.1em] text-muted uppercase tabular-nums">
                {phase.kind === "ready"
                  ? result
                    ? `${result.correctCount}/${result.total} · ${result.scorePct}%`
                    : `${answeredCount}/${questions.length} answered`
                  : ""}
              </span>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
              {phase.kind === "loading" ? (
                <p className="font-mono text-[0.7rem] leading-relaxed tracking-[0.06em] text-muted">
                  Writing ten questions on {target.skillName}…
                </p>
              ) : null}

              {phase.kind === "error" ? (
                <p className="border-2 border-line-soft px-3 py-2 text-[0.85rem] leading-relaxed text-muted">
                  {phase.message}
                </p>
              ) : null}

              {phase.kind === "ready" ? (
                <>
                  <p className="mb-5 max-w-[58ch] text-[0.85rem] leading-relaxed text-muted">
                    Ten questions on {phase.assessment.topic}. {passMark}% to pass. Passing adds{" "}
                    {target.skillName} to your profile and earns experience.
                  </p>

                  {result?.award ? (
                    <div className="mb-5 border-2 border-ink bg-sunk px-3 py-2.5">
                      <p className="font-mono text-[0.625rem] tracking-[0.12em] uppercase">
                        {result.award.skillName ? `${result.award.skillName} added` : "Experience earned"}
                      </p>
                      <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">
                        +{result.award.xpAwarded} XP — now {result.award.xp} XP, level{" "}
                        {result.award.level}
                        {result.award.leveledUp ? ". You levelled up." : "."}
                      </p>
                    </div>
                  ) : null}

                  {result?.passed && !result.award ? (
                    <div className="mb-5 border-2 border-hot px-3 py-2.5">
                      <p className="font-mono text-[0.625rem] tracking-[0.12em] text-hot uppercase">
                        Not recorded
                      </p>
                      <p className="mt-1 text-[0.85rem] leading-relaxed text-muted">
                        You passed, but the skill and experience could not be saved. Nothing was
                        lost on your side — try again later.
                      </p>
                    </div>
                  ) : null}

                  <ol className="flex flex-col gap-6">
                    {questions.map((question, index) => {
                      const chosen = answers[question.id];
                      const marked = key.get(question.id);
                      return (
                        <li key={question.id}>
                          <p className="mb-2.5 flex gap-2.5 text-[0.92rem] leading-relaxed font-semibold">
                            <span className="font-mono text-[0.7rem] text-faint tabular-nums">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            {question.prompt}
                          </p>
                          <div className="flex flex-col gap-1.5">
                            {question.options.map((option, optionIndex) => {
                              const isChosen = chosen === optionIndex;
                              const isAnswer = marked?.answerIndex === optionIndex;
                              return (
                                <label
                                  key={optionIndex}
                                  className={clsx(
                                    "flex cursor-pointer items-start gap-2.5 border-2 px-3 py-2 text-[0.85rem] leading-relaxed transition-colors",
                                    // After marking the key is shown: the right
                                    // option always, and the student's wrong one
                                    // marked as theirs.
                                    marked && isAnswer && "border-ink bg-sunk",
                                    marked && !isAnswer && isChosen && "border-hot text-hot",
                                    marked && !isAnswer && !isChosen && "border-line-soft text-muted",
                                    !marked && isChosen && "border-ink bg-sunk",
                                    !marked && !isChosen && "border-line-soft hover:border-ink",
                                  )}
                                >
                                  <input
                                    type="radio"
                                    name={question.id}
                                    checked={isChosen}
                                    disabled={result !== null || grading}
                                    onChange={() =>
                                      setAnswers((current) => ({
                                        ...current,
                                        [question.id]: optionIndex,
                                      }))
                                    }
                                    className="mt-1 size-3 accent-[var(--color-ink)]"
                                  />
                                  <span>{option}</span>
                                </label>
                              );
                            })}
                          </div>
                          {marked?.explanation ? (
                            <p className="mt-2 border-l-2 border-line-soft pl-3 text-[0.8rem] leading-relaxed text-muted">
                              {marked.explanation}
                            </p>
                          ) : null}
                        </li>
                      );
                    })}
                  </ol>
                </>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t-2 border-ink px-5 py-4">
              {phase.kind === "ready" && !result ? (
                <Button
                  onClick={() => void submit()}
                  disabled={answeredCount < questions.length || grading}
                  arrow
                >
                  {grading ? "Marking…" : "Submit"}
                </Button>
              ) : null}

              {phase.kind === "ready" && !result && answeredCount < questions.length ? (
                <span className="font-mono text-[0.625rem] tracking-[0.08em] text-faint uppercase">
                  {questions.length - answeredCount} left
                </span>
              ) : null}

              {gradeError ? (
                <span className="max-w-[34ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.04em] text-hot">
                  {gradeError}
                </span>
              ) : null}

              {result ? (
                <>
                  <span
                    className={clsx(
                      "border-2 px-2 py-1 font-mono text-[0.625rem] tracking-[0.12em] uppercase",
                      result.passed ? "border-ink" : "border-hot text-hot",
                    )}
                  >
                    {result.passed ? `Passed · ${result.scorePct}%` : `Not yet · ${result.scorePct}%`}
                  </span>
                  <span className="max-w-[34ch] font-mono text-[0.625rem] leading-relaxed tracking-[0.04em] text-muted">
                    {result.passed
                      ? `${result.correctCount} of ${result.total} correct.`
                      : `${result.correctCount} of ${result.total} correct — ${passMark}% to pass.`}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => void generate(target.slug)}>
                    Try a new set
                  </Button>
                </>
              ) : null}

              {phase.kind === "error" ? (
                <Button variant="outline" size="sm" onClick={() => void generate(target.slug)}>
                  Try again
                </Button>
              ) : null}

              <button
                type="button"
                onClick={onClose}
                className="ml-auto font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase transition-colors hover:text-hot"
              >
                Close
              </button>
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
