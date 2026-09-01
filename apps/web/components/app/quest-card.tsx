import type { Quest } from "@campusquest/shared";
import { clsx } from "clsx";
import { WordRise } from "@/components/motion/word-rise";
import { Reveal } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";
import { Chip, Label } from "@/components/ui/primitives";

const RARITY_LABEL: Record<Quest["rarity"], string> = {
  common: "Common",
  rare: "Rare",
  epic: "Epic",
  legendary: "Legendary",
};

/**
 * Rarity is the one place a second colour is allowed in, and only as a hairline
 * marker — the quest itself stays black-and-white so the type carries it.
 */
const RARITY_MARK: Record<Quest["rarity"], string> = {
  common: "bg-line-soft",
  rare: "bg-volt",
  epic: "bg-hot",
  legendary: "bg-ink",
};

export function QuestCard({ quest }: { quest: Quest }) {
  return (
    <article className="relative">
      <Label rule className="mb-5">
        Your next move
      </Label>

      <div className="mb-4 flex items-center gap-2.5">
        <span className={clsx("h-2.5 w-8", RARITY_MARK[quest.rarity])} />
        <span className="font-mono text-[0.6875rem] tracking-[0.18em] text-muted uppercase">
          {RARITY_LABEL[quest.rarity]} · {quest.estimatedHours}h
        </span>
      </div>

      <WordRise
        as="h2"
        text={quest.title}
        className="k-display text-[clamp(1.8rem,4.4vw,3.1rem)]"
      />

      <Reveal index={4} className="mt-5 flex flex-wrap gap-2">
        <Chip tone="hot">+{quest.xp} XP</Chip>
        {quest.skillsGained.map((s) => (
          <Chip key={s.id} tone="fill">
            {s.name}
          </Chip>
        ))}
        <Chip tone="soft">Portfolio</Chip>
      </Reveal>

      <Reveal index={5} className="mt-6 max-w-[54ch] text-[0.9rem] leading-relaxed text-muted">
        <p>
          <span className="font-semibold text-ink">Why this?</span> {quest.why}
        </p>
      </Reveal>

      <Reveal index={6} className="mt-7">
        <ul className="flex flex-col gap-2.5">
          {quest.steps.map((step, i) => (
            <li key={step.id} className="flex items-center gap-3 text-[0.86rem]">
              <span className="font-mono text-[0.6875rem] text-faint tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={clsx(
                  "size-2.5 shrink-0 border-2 border-ink",
                  step.done && "bg-ink",
                )}
              />
              <span className={clsx(step.done ? "text-faint line-through" : "text-ink-2")}>
                {step.label}
              </span>
            </li>
          ))}
        </ul>
      </Reveal>

      <Reveal index={7} className="mt-8">
        <ButtonLink href="/quests" arrow size="lg">
          Start quest
        </ButtonLink>
      </Reveal>
    </article>
  );
}
