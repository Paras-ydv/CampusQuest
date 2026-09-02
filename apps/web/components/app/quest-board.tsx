"use client";

import type { Profile, Quest, QuestCategory, QuestStatus } from "@campusquest/shared";
import { Pager, usePaged } from "@/components/ui/pager";
import { useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import { completeQuest, verifyQuestStep } from "@/lib/data/client";
import { Odometer } from "@/components/motion/odometer";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Chip, Label, SegmentBar } from "@/components/ui/primitives";

const RARITY_MARK: Record<Quest["rarity"], string> = {
  common: "bg-volt",
  rare: "bg-warn",
  epic: "bg-hot",
  legendary: "bg-hot",
};

const RARITY_LABEL: Record<Quest["rarity"], string> = {
  common: "Basic",
  rare: "Medium",
  epic: "Epic",
  legendary: "Legendary",
};

const RARITY_TEXT: Record<Quest["rarity"], string> = {
  common: "text-volt",
  rare: "text-warn",
  epic: "text-hot",
  legendary: "text-hot",
};

const STATUS_FILTERS: { key: QuestStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "available", label: "Available" },
  { key: "completed", label: "Completed" },
];

const CATEGORIES: (QuestCategory | "all")[] = [
  "all",
  "build",
  "learn",
  "compete",
  "contribute",
  "research",
  "connect",
];

export function QuestBoard({
  initialQuests,
  profile,
}: {
  initialQuests: Quest[];
  profile: Profile;
}) {
  const reduced = useReducedMotion();

  const [quests, setQuests] = useState(initialQuests);
  const [xp, setXp] = useState(profile.xp);
  const [level, setLevel] = useState(profile.level);
  const [status, setStatus] = useState<QuestStatus | "all">("all");
  const [category, setCategory] = useState<QuestCategory | "all">("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [repositoryUrls, setRepositoryUrls] = useState<Record<string, string>>(
    () => Object.fromEntries(initialQuests.map((quest) => [quest.id, quest.repositoryUrl ?? ""])),
  );
  const [verifying, setVerifying] = useState<string | null>(null);
  const [verificationMessage, setVerificationMessage] = useState<Record<string, string>>({});

  /**
   * Snapshot of state from just before the most recent completion, so a
   * mis-click on "Complete quest" can be reversed. Cleared after a short
   * window (or when the user undoes).
   */
  const [undoState, setUndoState] = useState<{
    quest: Quest;
    xp: number;
    level: number;
  } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function undoComplete() {
    if (!undoState) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    const snap = undoState;
    setQuests((prev) => prev.map((q) => (q.id === snap.quest.id ? snap.quest : q)));
    setXp(snap.xp);
    setLevel(snap.level);
    setLevelUp(null);
    setUndoState(null);
  }

  const visible = useMemo(
    () =>
      quests.filter(
        (q) =>
          (status === "all" || q.status === status) &&
          (category === "all" || q.category === category),
      ),
    [quests, status, category],
  );

  const counts = useMemo(
    () => ({
      active: quests.filter((q) => q.status === "active").length,
      available: quests.filter((q) => q.status === "available").length,
      completed: quests.filter((q) => q.status === "completed").length,
    }),
    [quests],
  );

  /**
   * Completion is staged so it reads as a sequence rather than a state flip:
   * steps tick off one at a time, then the XP rolls, then the level-up band
   * sweeps if the threshold was crossed.
   */
  async function complete(quest: Quest) {
    if (busyId) return;
    const requiresVerification = Boolean(quest.pathSkillId) || quest.steps.some((step) => step.verification === "github_file" || step.verification === "github_workflow");
    if (requiresVerification && quest.steps.some((step) => !step.done)) return;
    setBusyId(quest.id);

    // Capture pre-completion state for a possible undo.
    const snapshot = { quest, xp, level };
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndoState(null);

    if (!requiresVerification) {
      const stepDelay = reduced ? 0 : 320;
      quest.steps.forEach((step, index) => {
        setTimeout(() => setQuests((previous) => previous.map((item) => item.id === quest.id ? {
          ...item, steps: item.steps.map((itemStep) => itemStep.id === step.id ? { ...itemStep, done: true } : itemStep),
        } : item)), stepDelay * (index + 1));
      });
    }

    const result = await completeQuest(quest.id);

    setTimeout(() => {
        setQuests((prev) =>
          prev.map((q) =>
            q.id === quest.id ? { ...q, status: "completed" as const } : q,
          ),
        );
        setXp(result.xp);
        if (result.leveledUp) {
          setLevel(result.level);
          setLevelUp(result.level);
          setTimeout(() => setLevelUp(null), reduced ? 300 : 2400);
        }
        setBusyId(null);
        setUndoState(snapshot);
        undoTimer.current = setTimeout(
          () => setUndoState(null),
          reduced ? 4000 : 7000,
        );
      }, reduced ? 0 : 180);
  }

  async function verify(quest: Quest, stepId: string) {
    if (verifying) return;
    const repositoryUrl = repositoryUrls[quest.id]?.trim();
    if (!repositoryUrl) {
      setVerificationMessage((previous) => ({ ...previous, [quest.id]: "Enter your public GitHub repository first." }));
      return;
    }
    setVerifying(`${quest.id}:${stepId}`);
    setVerificationMessage((previous) => ({ ...previous, [quest.id]: "" }));
    try {
      const result = await verifyQuestStep(quest.id, stepId, repositoryUrl);
      setVerificationMessage((previous) => ({ ...previous, [quest.id]: result.message }));
      if (result.passed) {
        setQuests((previous) => previous.map((item) => item.id === quest.id ? {
          ...item, repositoryUrl, status: item.status === "available" ? "active" : item.status,
          steps: item.steps.map((step) => step.id === stepId ? { ...step, done: true, verifiedAt: new Date().toISOString(), verifiedCommit: result.commit, verificationMessage: result.message } : step),
        } : item));
      }
    } catch (error) {
      setVerificationMessage((previous) => ({ ...previous, [quest.id]: error instanceof Error ? error.message : "Verification failed. Please try again." }));
    } finally { setVerifying(null); }
  }

  const xpPct = Math.min(100, Math.round((xp / profile.xpToNext) * 100));


  const paged = usePaged(visible);
  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ---------------------------------------------------- level-up band */}
      <AnimatePresence>
        {levelUp !== null ? (
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            exit={{ scaleY: 0 }}
            transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="fixed inset-x-0 top-1/2 z-[100] flex origin-center -translate-y-1/2 items-center justify-center bg-hot py-10"
          >
            <motion.p
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="k-display text-center text-[clamp(2.5rem,11vw,7rem)] text-on-hot"
            >
              Level {String(levelUp).padStart(2, "0")}
            </motion.p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* ----------------------------------------------------------- header */}
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Quest board</Label>
        <WordRise
          as="h1"
          text="Every move, ranked."
          className="k-display text-[clamp(2.2rem,7vw,5rem)]"
        />

        <Reveal index={5} className="mt-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-end sm:gap-12">
          <div>
            <span className="k-label">Level</span>
            <p className="k-display text-[clamp(2.5rem,7vw,4rem)]">
              <Odometer value={level} delay={0.1} />
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-4">
              <span className="k-label">Experience</span>
              <span className="k-display text-[1.3rem]">
                <Odometer value={xp} delay={0.15} />
                <span className="ml-1.5 font-mono text-[0.75rem] font-normal tracking-normal text-muted normal-case">
                  / {profile.xpToNext.toLocaleString()}
                </span>
              </span>
            </div>
            <SegmentBar key={xpPct} value={xpPct} segments={30} animate={false} />
          </div>
        </Reveal>
      </section>

      {/* ---------------------------------------------------------- filters */}
      <section className="flex flex-wrap items-center gap-x-8 gap-y-4 border-b-2 border-ink px-5 py-5">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatus(f.key)}
              aria-pressed={status === f.key}
              className={clsx(
                "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.12em] uppercase transition-colors duration-250",
                status === f.key
                  ? "border-ink bg-ink text-paper"
                  : "border-line-soft text-muted hover:border-ink hover:text-ink",
              )}
            >
              {f.label}
              {f.key !== "all" ? (
                <span className="ml-1.5 opacity-60 tabular-nums">
                  {counts[f.key as keyof typeof counts]}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={clsx(
                "font-mono text-[0.6875rem] tracking-[0.1em] uppercase transition-colors duration-200",
                category === c
                  ? "text-hot underline decoration-2 underline-offset-4"
                  : "text-faint hover:text-ink",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------- quests */}
      <section className="px-5 py-9">
        {visible.length === 0 ? (
          <p className="py-16 text-center font-mono text-[0.8rem] text-muted">
            No quests match this filter.
          </p>
        ) : (
          <motion.ul layout className="grid gap-5 lg:grid-cols-2">
            <AnimatePresence mode="popLayout">
              {paged.items.map((quest) => {
                const done = quest.status === "completed";
                const busy = busyId === quest.id;
                const technical = Boolean(quest.pathSkillId) || quest.steps.some((step) => step.verification === "github_file" || step.verification === "github_workflow");
                const verifiedCount = quest.steps.filter((step) => step.done).length;
                const allVerified = verifiedCount === quest.steps.length;

                return (
                  <motion.li
                    key={quest.id}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.97 }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className={clsx(
                      "flex flex-col border-2 border-ink bg-surface",
                      done && "opacity-60",
                    )}
                  >
                    <span className={clsx("h-2.5 w-full", RARITY_MARK[quest.rarity])} />

                    <div className="flex flex-1 flex-col p-6">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-mono text-[0.625rem] tracking-[0.18em] uppercase">
                          <span className={RARITY_TEXT[quest.rarity]}>{RARITY_LABEL[quest.rarity]}</span>
                          <span className="text-muted"> · {quest.category} · {quest.estimatedHours}h</span>
                        </span>
                        <Chip tone={done ? "soft" : "hot"}>+{quest.xp} XP</Chip>
                      </div>

                      <h2 className="k-display mt-3 text-[1.5rem]">{quest.title}</h2>
                      <p className="mt-2 text-[0.86rem] leading-relaxed text-muted">
                        {quest.summary}
                      </p>

                      <ul className="mt-5 flex flex-col gap-2">
                        {quest.steps.map((step, i) => (
                          <li
                            key={step.id}
                            className="flex items-center gap-3 text-[0.83rem]"
                          >
                            <span className="font-mono text-[0.625rem] text-faint tabular-nums">
                              {String(i + 1).padStart(2, "0")}
                            </span>
                            <motion.span
                              animate={{
                                backgroundColor: step.done
                                  ? "var(--ink)"
                                  : "rgba(0,0,0,0)",
                              }}
                              transition={{ duration: 0.3 }}
                              className="size-2.5 shrink-0 border-2 border-ink"
                            />
                            <span
                              className={clsx(
                                "transition-colors duration-300",
                                step.done ? "text-faint line-through" : "text-ink-2",
                              )}
                            >
                              {step.label}
                            </span>
                            {technical && !done ? (
                              <button
                                type="button"
                                disabled={verifying !== null || step.done}
                                onClick={() => void verify(quest, step.id)}
                                className="ml-auto shrink-0 border border-ink px-2.5 py-1 font-mono text-[0.625rem] font-bold tracking-[0.12em] uppercase hover:bg-ink hover:text-paper disabled:opacity-45"
                              >
                                {verifying === `${quest.id}:${step.id}` ? "Checking..." : step.done ? "Verified" : "Verify"}
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>

                      {technical ? (
                        <div className="mt-6 border-t-2 border-line-soft pt-5">
                          <label className="k-label mb-2 block" htmlFor={`repository-${quest.id}`}>
                            Public GitHub repository
                          </label>
                          <input
                            id={`repository-${quest.id}`}
                            type="url"
                            value={repositoryUrls[quest.id] ?? ""}
                            onChange={(event) => setRepositoryUrls((previous) => ({ ...previous, [quest.id]: event.target.value }))}
                            placeholder="https://github.com/you/project"
                            className="w-full border-2 border-ink bg-transparent px-3 py-2.5 font-mono text-sm text-ink outline-none placeholder:text-faint focus:border-hot"
                          />
                          <p className="mt-2 text-[0.75rem] text-muted">{verifiedCount}/{quest.steps.length} tasks verified.</p>
                          {verificationMessage[quest.id] ? <p className="mt-2 text-[0.75rem] text-hot">{verificationMessage[quest.id]}</p> : null}
                        </div>
                      ) : null}

                      {quest.skillsGained.length > 0 ? (
                        <div className="mt-5 flex flex-wrap gap-1.5">
                          {quest.skillsGained.map((s) => (
                            <Chip key={s.id} tone="fill" className="text-[0.625rem]">
                              {s.name}
                            </Chip>
                          ))}
                        </div>
                      ) : null}

                      <p className="mt-5 border-t-2 border-line-soft pt-4 text-[0.82rem] leading-relaxed text-muted">
                        <span className="font-semibold text-ink">Why this?</span>{" "}
                        {quest.why}
                      </p>

                      {done && undoState?.quest.id === quest.id ? (
                        <button
                          type="button"
                          onClick={undoComplete}
                          className="mt-6 w-full border-2 border-ink bg-transparent py-3 font-mono text-[0.6875rem] font-bold tracking-[0.14em] text-ink uppercase transition-colors duration-300 hover:bg-ink hover:text-paper"
                        >
                          Undo — mark not done
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={done || busy || (technical && !allVerified)}
                          onClick={() => void complete(quest)}
                          className={clsx(
                            "mt-6 w-full border-2 py-3 font-mono text-[0.6875rem] font-bold tracking-[0.14em] uppercase transition-colors duration-300",
                            done
                              ? "border-line-soft text-faint"
                              : "border-ink bg-transparent text-ink hover:bg-ink hover:text-paper disabled:opacity-50",
                          )}
                        >
                          {done ? "Completed" : busy ? "Completing…" : "Complete quest"}
                        </button>
                      )}
                    </div>
                  </motion.li>
                );
              })}
            </AnimatePresence>
          </motion.ul>
        )}

        <Pager paged={paged} label="quests" />
      </section>
    </div>
  );
}
