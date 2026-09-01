"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { clsx } from "clsx";
import type { AcademicYear } from "@campusquest/shared";
import { ALL_SKILLS } from "@/lib/data/skills";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/primitives";

const BRANCHES = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Electrical",
  "Mechanical",
  "Mathematics",
  "Civil",
  "Chemical",
];

const GOAL_ROLES = [
  "AI/ML Engineer",
  "Backend Engineer",
  "Full-stack Engineer",
  "Data Engineer",
  "Research Scientist",
  "Platform / DevOps Engineer",
  "Robotics Engineer",
  "Product Engineer",
];

const INTERESTS = [
  "Machine learning",
  "Distributed systems",
  "Robotics",
  "Computer vision",
  "Open source",
  "Web development",
  "Data engineering",
  "Security",
  "Hardware",
  "Product design",
  "Competitive programming",
  "Research",
];

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

  const [name, setName] = useState("");
  const [branch, setBranch] = useState<string | null>(null);
  const [year, setYear] = useState<AcademicYear | null>(null);
  const [goalRole, setGoalRole] = useState<string | null>(null);
  const [skillIds, setSkillIds] = useState<string[]>([]);
  const [interests, setInterests] = useState<string[]>([]);

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
                    Be honest rather than aspirational — the gap is the useful
                    part. Pick at least three.
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
                  onClick={() => router.push("/journey")}
                  arrow
                  size="lg"
                  variant="hot"
                >
                  Enter CampusQuest
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
