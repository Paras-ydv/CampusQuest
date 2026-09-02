"use client";

import type { AcademicYear, Profile } from "@campusquest/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { clsx } from "clsx";
import type { Badge } from "@/lib/badges";
import { BadgeShelf } from "./badge-shelf";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Button } from "@/components/ui/button";
import { Avatar, Chip, Label } from "@/components/ui/primitives";
import { ACADEMIC_YEARS, BRANCHES, INTERESTS } from "@/lib/data/profile-options";
import { GOAL_ROLE_CHOICES } from "@/lib/data/role-families";

/** A selectable option, styled like the rest of the Kinetic chip row. */
function Option({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={clsx(
        "border-2 px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.1em] uppercase transition-colors duration-200",
        active ? "border-ink bg-ink text-paper" : "border-line-soft text-muted hover:border-ink hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

export function ProfileView({ profile, badges }: { profile: Profile; badges: Badge[] }) {
  const router = useRouter();

  const [name, setName] = useState(profile.name);
  const [branch, setBranch] = useState(profile.branch);
  const [year, setYear] = useState<AcademicYear>(profile.year);
  const [goalRole, setGoalRole] = useState(profile.goalRole);
  const [interests, setInterests] = useState<string[]>(profile.interests);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty =
    name !== profile.name || branch !== profile.branch || year !== profile.year ||
    goalRole !== profile.goalRole ||
    interests.slice().sort().join("|") !== profile.interests.slice().sort().join("|");

  function toggleInterest(value: string) {
    setSaved(false);
    setInterests((prev) => (prev.includes(value) ? prev.filter((i) => i !== value) : [...prev, value]));
  }

  async function save() {
    if (!dirty || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), branch, year, goalRole, interests }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? `Could not save your profile (${response.status}).`);
      }
      setSaved(true);
      // Changing the goal role changes the Time Machine, the Radar and the
      // recommended quest, so the whole shell has to re-read.
      router.refresh();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const questSkills = profile.skills.filter((item) => item.source === "quest");

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Your profile</Label>
        <div className="flex flex-wrap items-center gap-5">
          <Avatar initials={profile.initials} size="lg" />
          <div className="min-w-0">
            <WordRise as="h1" text={profile.name} className="k-display text-[clamp(1.8rem,5vw,3.2rem)]" />
            <p className="mt-2 font-mono text-[0.75rem] tracking-[0.08em] text-muted uppercase">
              {profile.email}
            </p>
          </div>
        </div>

        <Reveal index={4} className="mt-8 flex flex-wrap gap-x-10 gap-y-4">
          {[
            ["Level", String(profile.level)],
            ["XP", `${profile.xp.toLocaleString()} / ${profile.xpToNext.toLocaleString()}`],
            ["Skills", String(profile.skills.length)],
            ["Earned through quests", String(questSkills.length)],
            ["Projects", String(profile.projects.length)],
          ].map(([label, value]) => (
            <span key={label} className="flex flex-col">
              <span className="k-label">{label}</span>
              <span className="mt-1 font-display text-[1.3rem] font-bold tabular-nums">{value}</span>
            </span>
          ))}
        </Reveal>
      </section>

      {/* ------------------------------------------------------------- edit -- */}
      <section className="border-b-2 border-ink px-5 py-11">
        <Label className="mb-6">Edit your details</Label>

        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <label htmlFor="profile-name" className="k-label mb-2 block">Name</label>
            <input
              id="profile-name"
              value={name}
              onChange={(e) => { setName(e.target.value); setSaved(false); }}
              maxLength={120}
              className="w-full border-2 border-ink bg-surface px-4 py-3 text-[0.95rem] outline-none focus-visible:border-volt"
            />

            <p className="k-label mt-7 mb-2">Branch</p>
            <div className="flex flex-wrap gap-2">
              {BRANCHES.map((b) => (
                <Option key={b} active={branch === b} onClick={() => { setBranch(b); setSaved(false); }}>{b}</Option>
              ))}
            </div>

            <p className="k-label mt-7 mb-2">Year</p>
            <div className="flex flex-wrap gap-2">
              {ACADEMIC_YEARS.map((y) => (
                <Option key={y} active={year === y} onClick={() => { setYear(y as AcademicYear); setSaved(false); }}>
                  Year {y}
                </Option>
              ))}
            </div>
          </div>

          <div>
            <p className="k-label mb-2">Target role</p>
            <p className="mb-3 max-w-[46ch] text-[0.82rem] leading-relaxed text-muted">
              Everything on the Time Machine, Radar and your next quest is
              measured against this role. Changing it re-runs the analysis.
            </p>
            <div className="flex flex-wrap gap-2">
              {GOAL_ROLE_CHOICES.map((r) => (
                <Option key={r} active={goalRole === r} onClick={() => { setGoalRole(r); setSaved(false); }}>{r}</Option>
              ))}
            </div>

            <p className="k-label mt-7 mb-2">Interests</p>
            <p className="mb-3 text-[0.82rem] text-muted">Used to match you with research and teammates.</p>
            <div className="flex flex-wrap gap-2">
              {INTERESTS.map((i) => (
                <Option key={i} active={interests.includes(i)} onClick={() => toggleInterest(i)}>{i}</Option>
              ))}
            </div>
          </div>
        </div>

        {error ? (
          <p role="alert" className="mt-7 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed text-hot">
            {error}
          </p>
        ) : null}

        <div className="mt-8 flex flex-wrap items-center gap-4 border-t-2 border-ink pt-6">
          <Button onClick={save} disabled={!dirty || saving} size="lg" arrow>
            {saving ? "Saving…" : "Save changes"}
          </Button>
          {saved && !dirty ? (
            <span className="font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase">Saved</span>
          ) : null}
          {dirty && !saving ? (
            <span className="font-mono text-[0.6875rem] tracking-[0.12em] text-faint uppercase">Unsaved changes</span>
          ) : null}

          <form action="/auth/sign-out" method="post" className="ml-auto">
            <button
              type="submit"
              className="border-2 border-line-soft px-4 py-2.5 font-mono text-[0.6875rem] font-semibold tracking-[0.13em] text-muted uppercase transition-colors duration-200 hover:border-hot hover:text-hot"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>

      {/* ----------------------------------------------------------- skills -- */}
      <section className="border-b-2 border-ink px-5 py-11">
        <Label className="mb-5">Skills you hold</Label>
        {profile.skills.length === 0 ? (
          <p className="font-mono text-[0.8rem] text-muted">
            No skills recorded yet. Completing quests adds them here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {profile.skills.map((item) => (
              <Chip key={item.skill.id} tone={item.source === "quest" ? "fill" : "default"}>
                {item.skill.name}
                {item.source === "quest" ? " · earned" : ""}
              </Chip>
            ))}
          </div>
        )}
      </section>

      <section className="px-5 py-11">
        <BadgeShelf badges={badges} />
      </section>
    </div>
  );
}
