import type { Metadata } from "next";
import { genieSuggestionsFor } from "@/lib/data/genie-context";
import { getAlignmentData, getBadgesData, getNextQuestData, getOpportunitiesData, getPeersData, getProfile } from "@/lib/data/server";

import { BadgeShelf } from "@/components/app/badge-shelf";
import { GapList } from "@/components/app/gap-list";
import { JourneyMascot } from "@/components/app/journey-mascot";
import { GeniePanel } from "@/components/app/genie-panel";
import { OpportunityCard } from "@/components/app/opportunity-card";
import { PeerCard } from "@/components/app/peer-card";
import { QuestCard } from "@/components/app/quest-card";
import { StatRow } from "@/components/app/stat-row";

import { Counter } from "@/components/motion/counter";
import { Odometer } from "@/components/motion/odometer";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label, SegmentBar } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Journey" };

/** The dashboard shows the worst few gaps; the Time Machine holds the full list. */
const TOP_GAPS = 5;

export default async function JourneyPage() {
  const [profile, alignment, quest, peers, opportunities, badges] = await Promise.all([
    getProfile(),
    getAlignmentData(),
    getNextQuestData(),
    getPeersData(),
    getOpportunitiesData(),
    getBadgesData(),
  ]);

  const xpPct = Math.round((profile.xp / profile.xpToNext) * 100);
  const nowIso = new Date().toISOString();
  const closingSoon = opportunities.filter(
    (o) => o.deadline && new Date(o.deadline).getTime() - Date.now() < 7 * 86_400_000,
  ).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      {/* ------------------------------------------------------------ hero -- */}
      <section className="grid gap-8 border-b-2 border-ink px-5 py-12 lg:grid-cols-[auto_1fr_auto] lg:items-end lg:gap-16">
        <div>
          <Label className="mb-1">Level</Label>
          <p className="k-display text-[clamp(4.5rem,13vw,8.5rem)]">
            <Odometer value={profile.level} delay={0.2} />
          </p>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <span className="k-label">Experience</span>
            <span className="k-display text-[clamp(1.6rem,3.4vw,2.4rem)]">
              <Odometer value={profile.xp} />
              <span className="ml-2 font-mono text-[0.8rem] font-normal tracking-normal text-muted normal-case">
                / {profile.xpToNext.toLocaleString()}
              </span>
            </span>
          </div>

          <SegmentBar value={xpPct} />

          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 font-mono text-[0.6875rem] tracking-[0.1em] text-muted uppercase">
            <span>{xpPct}% to level {profile.level + 1}</span>
            <span>
              Alignment{" "}
              <span className="text-ink">
                <Counter value={alignment.currentPct} suffix="%" />
              </span>{" "}
              · {alignment.roleCount} roles surveyed {alignment.yearsCovered}
            </span>
          </div>
        </div>

        <div className="justify-self-end lg:self-start">
          <JourneyMascot
            level={profile.level}
            xp={profile.xp}
            xpToNext={profile.xpToNext}
          />
        </div>
      </section>

      {/* ------------------------------------------------- next move + stats */}
      <div className="grid lg:grid-cols-[1.5fr_1fr]">
        <div className="border-b-2 border-ink px-5 py-10 lg:border-r-2 lg:border-b-0">
          <QuestCard quest={quest} />
        </div>

        <div className="flex flex-col border-b-2 border-ink lg:border-b-0">
          <StatRow
            value={alignment.gaps.length}
            label="Gaps"
            detail={alignment.gaps.map((g) => g.skill.name).join(", ")}
            href="/time-machine"
            delayMs={150}
          />
          <StatRow
            value={opportunities.length}
            label="Radar"
            detail={`${closingSoon} closing this week`}
            href="/radar"
            delayMs={250}
          />
          <StatRow
            value={peers.length}
            label="Peers"
            detail="Complementary skills on campus"
            href="/people"
            delayMs={350}
          />
          <StatRow
            value={alignment.roleCount}
            label="Roles"
            detail={`Surveyed ${alignment.yearsCovered}`}
            href="/time-machine"
            delayMs={450}
          />
        </div>
      </div>

      {/* ------------------------------------------------------------ gaps -- */}
      <section className="border-t-2 border-ink px-5 py-11">
        <div className="grid gap-10 lg:grid-cols-[24rem_1fr] lg:gap-16">
          <div>
            <Label className="mb-4">Where you stand</Label>
            <WordRise
              as="h2"
              text="The skills your roles kept asking for"
              className="k-headline text-[clamp(1.5rem,3vw,2.1rem)]"
            />
            <Reveal index={3} className="mt-4 max-w-[38ch] text-[0.88rem] leading-relaxed text-muted">
              <p>
                The {Math.min(TOP_GAPS, alignment.gaps.length)} biggest of{" "}
                {alignment.gaps.length}, measured against {alignment.roleCount}{" "}
                roles that recruited on campus between {alignment.yearsCovered}.
                The bar is how often the skill was required; the figure in red is
                what closing it adds to your alignment.
              </p>
            </Reveal>
            <Reveal index={4} className="mt-6">
              <ButtonLink href="/time-machine" variant="outline" arrow size="sm">
                {alignment.gaps.length > TOP_GAPS
                  ? `See all ${alignment.gaps.length} in the Time Machine`
                  : "Open the Time Machine"}
              </ButtonLink>
            </Reveal>
          </div>

          <div>
            <GapList gaps={alignment.gaps} limit={TOP_GAPS} />
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------ progression -- */}
      <section className="border-t-2 border-ink px-5 py-11">
        <div className="mx-auto max-w-[1400px]">
          <Reveal index={2}>
            <BadgeShelf badges={badges} />
          </Reveal>
        </div>
      </section>

      {/* ----------------------------------------------------------- genie -- */}
      <section className="border-t-2 border-ink px-5 py-11">
        <GeniePanel suggestions={genieSuggestionsFor("/journey")} scopeLabel="your journey" />
      </section>

      {/* ------------------------------------------- build with + on your radar */}
      <section className="border-t-2 border-ink">
        <div className="grid lg:grid-cols-[1.35fr_1fr]">
          <div className="border-b-2 border-ink px-5 py-11 lg:border-r-2 lg:border-b-0">
            <Label rule className="mb-7">
              Build with — {peers.length} complementary peers
            </Label>
            <div className="flex flex-col gap-5">
              {peers.slice(0, 3).map((peer, i) => (
                <Reveal key={peer.id} index={i}>
                  <PeerCard peer={peer} />
                </Reveal>
              ))}
            </div>
          </div>

          <div className="px-5 py-11">
            <Label rule className="mb-7">
              On your radar — {opportunities.length} matched
            </Label>
            <div className="flex flex-col gap-5">
              {opportunities.slice(0, 3).map((o, i) => (
                <Reveal key={o.id} index={i}>
                  <OpportunityCard opportunity={o} nowIso={nowIso} />
                </Reveal>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
