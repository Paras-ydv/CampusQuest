"use client";

import { useMemo, useState } from "react";
import { GOAL_ROLE_CHOICES } from "@/lib/data/role-families";
import { BRANCHES, INTERESTS } from "@/lib/data/profile-options";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import type { AcademicYear, ResumeExtraction } from "@campusquest/shared";
import { ALL_SKILLS } from "@/lib/data/skills";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";
import { ResumeUpload } from "@/components/onboarding/resume-upload";



// Specializations are resolved to the warehouse's existing role families.
const GOAL_ROLES = [...GOAL_ROLE_CHOICES];


const STEPS = [
  { key: "about", label: "About you" },
  { key: "goal", label: "Your target" },
  { key: "skills", label: "What you hold" },
  { key: "interests", label: "What you're into" },
  { key: "review", label: "Review" },
] as const;

/* ------------------------------------------------------------- Toggle -- */

function Toggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "border-2 px-3.5 py-2 text-left font-mono text-[0.72rem] tracking-[0.04em] transition-[background-color,color,border-color,transform] duration-250",
        "hover:-translate-y-0.5",
        active
          ? "border-ink bg-ink text-paper"
          : "border-line-soft text-muted hover:border-ink hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/* -------------------------------------------------------------- Flow -- */

export function OnboardingFlow() {
  const router = useRouter();
  const reduced = useReducedMotion();

  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);

  /**
   * The wizard itself is unchanged; `mode` gates it. Until the student picks a
   * way in, the chooser renders instead of step 0 — so the manual path is
   * exactly the flow that shipped, and a résumé is only ever a head start on
   * the skills step.
   */
  const [mode, setMode] = useState<"choose" | "manual" | "resume">("choose");
  /** Which of the selected skills came from the résumé, for the provenance note. */
  const [fromResume, setFromResume] = useState<string[]>([]);
  /** Which "about you" fields the résumé filled in, so the student knows to check them. */
  const [prefilled, setPrefilled] = useState<string[]>([]);

  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [goalRole, setGoalRole] = useState<string | null>(null);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  /**
   * Five steps of answers were previously thrown away on the last click. They
   * now go to POST /api/onboarding, which fills in the profile row the signup
   * trigger created. In mock mode the route merges them into the demo profile,
   * so this path behaves the same with or without a database.
   */
  async function finish() {
    setSaving(true);
    setSaveError(null);
    try {
      const response = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, branch, year, goalRole, skillIds, interests }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Could not save your profile (${response.status}).`);
      }
      // The dashboard reads the profile server-side, so refresh before leaving
      // or it renders the pre-onboarding row from cache.
      router.refresh();
      router.push("/journey");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "Could not save your profile.");
      setSaving(false);
    }
  }

  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return name.trim().length > 0 && !!branch && !!year;
      case 1:
        return !!goalRole;
      case 2:
        return skillIds.length >= 3;
      case 3:
        return interests.length >= 1;
      default:
        return true;
    }
  }, [step, name, branch, year, goalRole, skillIds, interests]);

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
  }

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const variants = {
    enter: (d: number) => ({ opacity: 0, x: d * 36 }),
    center: { opacity: 1, x: 0 },
    exit: (d: number) => ({ opacity: 0, x: d * -36 }),
  };

  /**
   * Accepts the extraction and enters the ordinary wizard with the matched
   * skills already ticked. It deliberately starts at step 0 rather than
   * skipping ahead to the skills step: name, branch, year and goal role are
   * required by `OnboardingInput` and a résumé does not supply them, so
   * jumping the queue would only fail validation at the end. The saving is
   * that step 2 arrives pre-filled — every chip still toggles, and the "at
   * least three" rule still applies, because the résumé is a starting point,
   * not an authority.
   */
  function acceptResume(result: ResumeExtraction) {
    setSkillIds(result.skillIds);
    setFromResume(result.skillIds);
    // Each of these is null whenever the résumé did not state it clearly, and
    // a null must not overwrite anything — the student may have come back
    // through the upload screen after typing.
    if (result.name) setName(result.name);
    if (result.branch) setBranch(result.branch);
    if (result.year) setYear(result.year);
    setPrefilled([result.name && "name", result.branch && "branch", result.year && "year"].filter(Boolean) as string[]);
    setMode("resume");
    setDirection(1);
    setStep(0);
  }

  if (mode === "choose") {
    return (
      <div className="flex flex-1 items-start px-5 py-12 md:py-16">
        <div className="mx-auto w-full max-w-[52rem]">
          <Label className="mb-4">Getting started</Label>
          <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
            How should we
            <br />
            start your map?
          </h1>
          <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
            Either way you review everything before it&apos;s saved, and every
            field stays editable from your profile afterwards.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setMode("manual")}
              className="border-2 border-line-soft p-6 text-left transition-[border-color,transform] duration-250 hover:-translate-y-0.5 hover:border-ink"
            >
              <span className="k-label">Add manually</span>
              <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">
                Five short steps. Pick your skills from our list — most people
                finish in a couple of minutes.
              </p>
            </button>

            <button
              type="button"
              onClick={() => setMode("resume")}
              className="border-2 border-ink p-6 text-left transition-transform duration-250 hover:-translate-y-0.5"
            >
              <span className="k-label">Start from your résumé</span>
              <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">
                Upload a PDF and we&apos;ll pre-select the skills we recognise.
                The file is never stored.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Résumé mode before extraction: the upload screen stands in for the wizard.
  if (mode === "resume" && !fromResume.length) {
    return (
      <div className="flex flex-1 items-start px-5 py-12 md:py-16">
        <div className="mx-auto w-full max-w-[52rem]">
          <Label className="mb-4">Your résumé</Label>
          <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
            Let&apos;s read what
            <br />
            you&apos;ve already done.
          </h1>
          <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
            We look for the skills in our catalogue and pre-tick them for you.
            You&apos;ll review the list on the next screen — nothing is saved
            until you finish.
          </p>
          <ResumeUpload onExtracted={acceptResume} onSkip={() => setMode("manual")} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* ------------------------------------------------------ progress -- */}
      <div className="sticky top-0 z-30 border-b-2 border-ink bg-paper/90 px-5 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-[52rem] items-center gap-5">
          <span className="k-label shrink-0">
            {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
          </span>
          <div className="flex flex-1 gap-1">
            {STEPS.map((s, i) => (
              <span key={s.key} className="relative h-1.5 flex-1 bg-sunk">
                <motion.span
                  className="absolute inset-0 origin-left bg-ink"
                  initial={false}
                  animate={{ scaleX: i <= step ? 1 : 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
            ))}
          </div>
          <span className="k-label hidden shrink-0 sm:block">
            {STEPS[step].label}
          </span>
        </div>
      </div>

      {/* ---------------------------------------------------------- body -- */}
      <div className="flex flex-1 items-start px-5 py-12 md:py-16">
        <div className="mx-auto w-full max-w-[52rem]">
          <AnimatePresence mode="wait" custom={direction} initial={false}>
            <motion.div
              key={step}
              custom={direction}
              variants={reduced ? undefined : variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* ------------------------------------------- 0 · about -- */}
              {step === 0 ? (
                <div>
                  <Label className="mb-4">About you</Label>
                  <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
                    First, who are we
                    <br />
                    building this for?
                  </h1>

                  {prefilled.length ? (
                    <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
                      We filled in your {prefilled.join(", ").replace(/, ([^,]*)$/, " and $1")} from
                      your résumé. Correct anything we got wrong.
                    </p>
                  ) : null}

                  <div className="mt-10 flex flex-col gap-8">
                    <div>
                      <label
                        htmlFor="ob-name"
                        className="k-label mb-2.5 block"
                      >
                        Your name
                      </label>
                      <input
                        id="ob-name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Kartikeya"
                        autoComplete="name"
                        className="w-full max-w-sm border-2 border-ink bg-surface px-4 py-3 font-mono text-[0.85rem] placeholder:text-faint focus:outline-none focus-visible:border-volt"
                      />
                    </div>

                    <div>
                      <span className="k-label mb-2.5 block">Branch</span>
                      <div className="flex flex-wrap gap-2">
                        {BRANCHES.map((b) => (
                          <Toggle
                            key={b}
                            active={branch === b}
                            onClick={() => setBranch(b)}
                          >
                            {b}
                          </Toggle>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="k-label mb-2.5 block">Year</span>
                      <div className="flex flex-wrap gap-2">
                        {([1, 2, 3, 4, 5] as const).map((y) => (
                          <Toggle
                            key={y}
                            active={year === y}
                            onClick={() => setYear(y)}
                          >
                            Year {y}
                          </Toggle>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              {/* -------------------------------------------- 1 · goal -- */}
              {step === 1 ? (
                <div>
                  <Label className="mb-4">Your target</Label>
                  <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
                    Where do you
                    <br />
                    want to end up?
                  </h1>
                  <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
                    Everything downstream works backwards from this — the roles
                    we survey, the gaps we find, the quests we build. You can
                    change it any time.
                  </p>
                  <div className="mt-9 grid gap-2 sm:grid-cols-2">
                    {GOAL_ROLES.map((r) => (
                      <Toggle
                        key={r}
                        active={goalRole === r}
                        onClick={() => setGoalRole(r)}
                      >
                        {r}
                      </Toggle>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ------------------------------------------ 2 · skills -- */}
              {step === 2 ? (
                <div>
                  <Label className="mb-4">What you hold</Label>
                  <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
                    What can you
                    <br />
                    already do?
                  </h1>
                  <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
                    {fromResume.length
                      ? `We pre-selected ${fromResume.length} ${fromResume.length === 1 ? "skill" : "skills"} from your résumé. Untick anything you wouldn't be comfortable being asked about, and add what it missed — the gap is the useful part.`
                      : "Be honest rather than aspirational — the gap is the useful part. Pick at least three."}
                  </p>
                  <div className="mt-9 flex flex-wrap gap-2">
                    {ALL_SKILLS.map((s) => (
                      <Toggle
                        key={s.id}
                        active={skillIds.includes(s.id)}
                        onClick={() => toggle(skillIds, setSkillIds, s.id)}
                      >
                        {s.name}
                      </Toggle>
                    ))}
                  </div>
                  <p className="mt-5 font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
                    {skillIds.length} selected
                    {skillIds.length < 3 ? " · pick at least 3" : ""}
                  </p>
                </div>
              ) : null}

              {/* --------------------------------------- 3 · interests -- */}
              {step === 3 ? (
                <div>
                  <Label className="mb-4">What you&apos;re into</Label>
                  <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
                    What would you
                    <br />
                    build for fun?
                  </h1>
                  <p className="mt-5 max-w-[48ch] text-[0.92rem] leading-relaxed text-muted">
                    This drives who we introduce you to and which research we
                    surface — it&apos;s the half of matching that skills
                    can&apos;t tell us.
                  </p>
                  <div className="mt-9 flex flex-wrap gap-2">
                    {INTERESTS.map((i) => (
                      <Toggle
                        key={i}
                        active={interests.includes(i)}
                        onClick={() => toggle(interests, setInterests, i)}
                      >
                        {i}
                      </Toggle>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* ------------------------------------------ 4 · review -- */}
              {step === 4 ? (
                <div>
                  <Label className="mb-4">Review</Label>
                  <h1 className="k-display text-[clamp(2rem,6vw,3.4rem)]">
                    That&apos;s your
                    <br />
                    starting point.
                  </h1>

                  <dl className="mt-10 border-t-2 border-ink">
                    {[
                      ["Name", name || "—"],
                      ["Branch", `${branch ?? "—"} · Year ${year ?? "—"}`],
                      ["Target role", goalRole ?? "—"],
                      [
                        "Skills",
                        skillIds.length
                          ? ALL_SKILLS.filter((s) => skillIds.includes(s.id))
                              .map((s) => s.name)
                              .join(", ")
                          : "—",
                      ],
                      ["Interests", interests.join(", ") || "—"],
                    ].map(([k, v]) => (
                      <div
                        key={k}
                        className="grid gap-1 border-b-2 border-line-soft py-4 sm:grid-cols-[10rem_1fr] sm:gap-5"
                      >
                        <dt className="k-label">{k}</dt>
                        <dd className="text-[0.9rem] text-ink-2">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  <p className="mt-6 max-w-[52ch] text-[0.88rem] leading-relaxed text-muted">
                    Next we measure this against the roles that recruited on
                    your campus and show you the gap. Nothing here is locked —
                    every field is editable from your profile.
                  </p>
                </div>
              ) : null}
            </motion.div>
          </AnimatePresence>

          {/* ------------------------------------------------------ nav -- */}
          {saveError ? (
            <p
              role="alert"
              className="mt-8 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot"
            >
              {saveError}
            </p>
          ) : null}

          <div className="mt-12 flex items-center gap-3 border-t-2 border-ink pt-6">
            {step > 0 ? (
              <Button variant="ghost" onClick={() => go(step - 1)}>
                Back
              </Button>
            ) : null}

            <div className="ml-auto">
              {step < STEPS.length - 1 ? (
                <Button
                  onClick={() => go(step + 1)}
                  disabled={!canAdvance}
                  arrow
                  size="lg"
                >
                  Continue
                </Button>
              ) : (
                <Button
                  onClick={finish}
                  disabled={saving}
                  arrow
                  size="lg"
                  variant="hot"
                >
                  {saving ? "Saving…" : "Enter CampusQuest"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
