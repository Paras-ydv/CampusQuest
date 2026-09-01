import { LandingNav } from "@/components/marketing/landing-nav";
import { GapList } from "@/components/app/gap-list";
import { Marquee } from "@/components/motion/marquee";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Counter } from "@/components/motion/counter";
import { Odometer } from "@/components/motion/odometer";
import { ButtonLink } from "@/components/ui/button";
import { Chip, Label, SegmentBar } from "@/components/ui/primitives";
import { DEMO_GAPS, TICKER_ITEMS } from "@/lib/data/fixtures";

/**
 * The journey is genuinely sequential — each step depends on the one before it
 * — so numbering it encodes something true rather than decorating the section.
 */
const STEPS = [
  {
    n: "01",
    title: "Discover",
    body: "Say where you want to end up. CampusQuest reads the roles that actually recruited on your campus and works backwards from them.",
  },
  {
    n: "02",
    title: "See the gap",
    body: "Not generic advice — the specific skills those roles kept asking for that you don't yet hold, ranked by how much each one is worth.",
  },
  {
    n: "03",
    title: "Turn it into quests",
    body: "Each gap becomes something you can actually do this week, with XP, a skill, and a portfolio artefact at the end of it.",
  },
  {
    n: "04",
    title: "Find your people",
    body: "The students whose skills complete yours, not duplicate them. Then build the thing together.",
  },
] as const;

const FEATURES = [
  {
    label: "Placement Time Machine",
    title: "What did they actually ask for?",
    body: "Query years of campus placement data in plain language. Which skills repeat across backend roles? What happens to your alignment if you learn Docker first? Every number comes from SQL, so it is reproducible — and every answer shows the query that produced it.",
    stat: { value: 41, suffix: "", caption: "roles surveyed, 2022–2025" },
  },
  {
    label: "People Matchmaker",
    title: "The teammate you're missing",
    body: "Two students who both know PyTorch make a worse team than one who knows PyTorch and one who knows embedded systems. CampusQuest matches on complementary skills and shared intent, then tells you exactly why it paired you.",
    stat: { value: 6, suffix: "", caption: "complementary peers, typical match" },
  },
  {
    label: "Opportunity Radar",
    title: "Everything, in one place",
    body: "Internships, hackathons, open-source issues, research openings, workshops and scholarships — matched against your skills and your gaps, with the ones closing this week pushed to the front.",
    stat: { value: 12, suffix: "", caption: "matched opportunities right now" },
  },
] as const;

export default function LandingPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <LandingNav />

      {/* ------------------------------------------------------------ hero -- */}
      <section className="border-b-2 border-ink px-5 pt-16 pb-12 md:pt-24 md:pb-16">
        <div className="mx-auto max-w-[1400px]">
          <Reveal className="mb-7">
            <Chip tone="hot">Powered by Databricks Genie</Chip>
          </Reveal>

          <WordRise
            as="h1"
            text="Stop guessing what to learn next."
            className="k-display max-w-[16ch] text-[clamp(2.8rem,10vw,8rem)]"
          />

          <Reveal index={6} delay={0.3} className="mt-8 max-w-[52ch]">
            <p className="text-[1.05rem] leading-relaxed text-muted md:text-[1.15rem]">
              You know you want to work in AI. You don&apos;t know which of the
              hundred possible next steps is the right one. CampusQuest reads
              the roles that actually recruited on your campus, finds the exact
              skills you&apos;re missing, and turns them into things you can
              build this week — with the people who complete your team.
            </p>
          </Reveal>

          <Reveal index={8} delay={0.35} className="mt-9 flex flex-wrap gap-3">
            <ButtonLink href="/journey" size="lg" arrow>
              See the demo
            </ButtonLink>
            <ButtonLink href="/onboarding" size="lg" variant="outline">
              Build my journey
            </ButtonLink>
          </Reveal>
        </div>
      </section>

      {/* ---------------------------------------------------------- ticker -- */}
      <div className="border-b-2 border-ink bg-hot text-on-hot">
        <Marquee
          duration={48}
          items={TICKER_ITEMS.map((t) => (
            <span
              key={t}
              className="font-mono text-[0.6875rem] tracking-[0.14em] uppercase"
            >
              {t}
            </span>
          ))}
        />
      </div>

      {/* --------------------------------------------------------- problem -- */}
      <section className="border-b-2 border-ink px-5 py-16 md:py-20">
        <div className="mx-auto grid max-w-[1400px] gap-10 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div>
            <Label className="mb-5">The problem</Label>
            <WordRise
              as="h2"
              text="Six tabs, none of which talk to each other."
              className="k-headline text-[clamp(1.7rem,4vw,2.9rem)]"
            />
          </div>
          <div className="flex flex-col justify-center gap-5 text-[0.95rem] leading-relaxed text-muted">
            <p>
              You learn Python on one platform. You hunt internships on another.
              Hackathons live in a WhatsApp group. Research happens behind a
              faculty page nobody reads. And the companies that hired from your
              campus last year left a trail of exactly what they wanted — which
              nobody ever shows you.
            </p>
            <p>
              Meanwhile there are dozens of students on your own campus with the
              skills you lack, looking for the skills you have. You will never
              meet them.
            </p>
            <p className="font-semibold text-ink">
              CampusQuest is the layer that connects all of it.
            </p>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- steps -- */}
      <section className="border-b-2 border-ink px-5 py-16 md:py-20">
        <div className="mx-auto max-w-[1400px]">
          <Label rule className="mb-10">
            How it works
          </Label>
          <div className="grid gap-x-8 gap-y-10 sm:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} index={i}>
                <div className="border-t-2 border-ink pt-5">
                  <span className="font-mono text-[0.6875rem] tracking-[0.2em] text-hot">
                    {step.n}
                  </span>
                  <h3 className="k-display mt-3 text-[1.6rem]">{step.title}</h3>
                  <p className="mt-3 text-[0.88rem] leading-relaxed text-muted">
                    {step.body}
                  </p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ proof block -- */}
      <section className="border-b-2 border-ink px-5 py-16 md:py-20">
        <div className="mx-auto grid max-w-[1400px] gap-12 lg:grid-cols-[1fr_1.15fr] lg:gap-20">
          <div>
            <Label className="mb-5">What it looks like</Label>
            <WordRise
              as="h2"
              text="Advice you can check."
              className="k-headline text-[clamp(1.7rem,4vw,2.9rem)]"
            />
            <Reveal index={3} className="mt-5 max-w-[46ch] text-[0.95rem] leading-relaxed text-muted">
              <p>
                Every recommendation carries the number behind it and the query
                that produced it. This is a real skill-gap readout: how often
                each skill appeared across surveyed roles, and what closing it
                adds to your alignment.
              </p>
            </Reveal>
            <Reveal index={4} className="mt-7">
              <ButtonLink href="/journey" variant="outline" arrow>
                Open the dashboard
              </ButtonLink>
            </Reveal>
          </div>

          <Reveal index={2}>
            <div className="border-2 border-ink bg-surface">
              <div className="flex items-baseline justify-between border-b-2 border-ink px-5 py-3">
                <Label>Skill gaps · AI/ML Engineer</Label>
                <span className="font-mono text-[0.6875rem] text-muted tabular-nums">
                  41 roles
                </span>
              </div>
              <div className="px-5 py-4">
                <GapList gaps={DEMO_GAPS} />
              </div>
              <div className="border-t-2 border-ink px-5 py-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="k-label">Alignment</span>
                  <span className="k-display text-[1.5rem]">
                    <Odometer value={62} />%
                  </span>
                </div>
                <SegmentBar value={62} segments={22} />
                <p className="mt-3 font-mono text-[0.6875rem] tracking-[0.08em] text-muted uppercase">
                  → 74% with Docker
                </p>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* -------------------------------------------------------- features -- */}
      {FEATURES.map((f) => (
        <section key={f.label} className="border-b-2 border-ink px-5 py-16 md:py-20">
          <div className="mx-auto grid max-w-[1400px] items-center gap-10 lg:grid-cols-[1fr_auto] lg:gap-20">
            <div>
              <Label className="mb-5">{f.label}</Label>
              <WordRise
                as="h2"
                text={f.title}
                className="k-headline max-w-[18ch] text-[clamp(1.7rem,4.4vw,3.2rem)]"
              />
              <Reveal index={3} className="mt-5 max-w-[56ch] text-[0.95rem] leading-relaxed text-muted">
                <p>{f.body}</p>
              </Reveal>
            </div>
            <Reveal index={2} className="lg:text-right">
              <p className="k-display text-[clamp(3.5rem,9vw,6.5rem)] text-hot">
                <Counter value={f.stat.value} suffix={f.stat.suffix} />
              </p>
              <p className="mt-1 max-w-[20ch] font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase lg:ml-auto">
                {f.stat.caption}
              </p>
            </Reveal>
          </div>
        </section>
      ))}

      {/* ------------------------------------------------------------- cta -- */}
      <section className="bg-ink px-5 py-20 text-paper md:py-28">
        <div className="mx-auto max-w-[1400px]">
          <WordRise
            as="h2"
            text="Where do you go next?"
            className="k-display max-w-[14ch] text-[clamp(2.4rem,9vw,6.5rem)]"
          />
          <Reveal index={5} className="mt-7 max-w-[48ch]">
            <p className="text-[1rem] leading-relaxed text-paper/70">
              Build a profile in two minutes and see the gap between where you
              are and the roles you&apos;re aiming at.
            </p>
          </Reveal>
          <Reveal index={6} className="mt-9">
            <ButtonLink
              href="/onboarding"
              size="lg"
              variant="hot"
              arrow
              className="border-hot"
            >
              Build my journey
            </ButtonLink>
          </Reveal>
        </div>
      </section>

      <footer className="border-t-2 border-ink px-5 py-7">
        <div className="mx-auto flex max-w-[1400px] flex-wrap items-center gap-x-8 gap-y-2">
          <span className="k-display text-[0.95rem]">CampusQuest</span>
          <span className="font-mono text-[0.6875rem] text-faint">
            Demo data is synthetic. Alignment figures are historical and are not
            a prediction of placement.
          </span>
        </div>
      </footer>
    </div>
  );
}
