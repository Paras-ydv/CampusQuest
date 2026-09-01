import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { ButtonLink } from "@/components/ui/button";
import { Chip, Label } from "@/components/ui/primitives";

/**
 * Placeholder for a screen scheduled in pass two. It states what the screen
 * will show and which endpoint it is waiting on, so the nav is never a dead end
 * and the team can see the seam.
 */
export function Planned({
  label,
  title,
  body,
  willShow,
  endpoint,
  owner,
}: {
  label: string;
  title: string;
  body: string;
  willShow: string[];
  endpoint: string;
  owner: string;
}) {
  return (
    <div className="mx-auto max-w-[1400px] px-5 py-16 md:py-24">
      <Label className="mb-5">{label}</Label>
      <WordRise
        as="h1"
        text={title}
        className="k-display max-w-[16ch] text-[clamp(2.2rem,7vw,4.5rem)]"
      />

      <Reveal index={5} className="mt-6 max-w-[54ch]">
        <p className="text-[1rem] leading-relaxed text-muted">{body}</p>
      </Reveal>

      <div className="mt-12 grid gap-10 border-t-2 border-ink pt-8 lg:grid-cols-[1fr_auto] lg:gap-20">
        <Reveal index={6}>
          <p className="k-label mb-4">This screen will show</p>
          <ul className="flex flex-col gap-2.5">
            {willShow.map((item) => (
              <li key={item} className="flex gap-3 text-[0.9rem] text-ink-2">
                <span className="mt-2 size-1.5 shrink-0 bg-hot" />
                {item}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal index={7}>
          <p className="k-label mb-4">Waiting on</p>
          <div className="flex flex-col items-start gap-3">
            <Chip tone="fill">{endpoint}</Chip>
            <span className="font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
              Owned by {owner}
            </span>
          </div>
        </Reveal>
      </div>

      <Reveal index={8} className="mt-12">
        <ButtonLink href="/journey" variant="outline" arrow>
          Back to your journey
        </ButtonLink>
      </Reveal>
    </div>
  );
}
