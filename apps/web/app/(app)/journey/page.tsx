import type { Metadata } from "next";
import { Suspense } from "react";
import { genieSuggestionsFor } from "@/lib/data/genie-context";
import {
  getAlignment,
  getNextQuest,
  getBadges,
  getOpportunities,
  getPeers,
  getProfile,
} from "@/lib/data/server";

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
import { LoadingRegion, Skeleton, SkeletonCard } from "@/components/ui/skeleton";

export const metadata: Metadata = { title: "Journey" };

/**
 * ===========================================================================
 *  STREAMING
 * ===========================================================================
 * This screen reads six sources, and four of them reach the Databricks
 * warehouse. Awaiting them together in the page body meant the browser received
 * nothing until the slowest one returned.
 *
 * The page now renders its structure from the profile alone — which the app
 * shell has already read, so it costs nothing here — and every section that
 * needs the warehouse sits behind its own `<Suspense>` boundary. The sections
 * still start their requests immediately and in parallel; the difference is
 * that each one paints as soon as it can rather than all of them waiting on the
 * slowest.
 *
 * The section components below render exactly the markup that used to be
 * inline, so the finished page is unchanged.
 */

export default async function JourneyPage() {
  const profile = await getProfile();
  const xpPct = Math.round((profile.xp / profile.xpToNext) * 100);

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
            <Suspense fallback={<span className="text-faint">Alignment …</span>}>
              <HeroAlignment />
            </Suspense>
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
          <Suspense
            fallback={
              <LoadingRegion label="Selecting your next quest">
                <SkeletonCard className="h-full min-h-[13rem]" />
              </LoadingRegion>
            }
          >
            <NextQuest />
          </Suspense>
        </div>

        <div className="flex flex-col border-b-2 border-ink lg:border-b-0">
          <Suspense fallback={<StatsSkeleton />}>
            <Stats />
          </Suspense>
        </div>
      </div>

      {/* ------------------------------------------------------------ gaps -- */}
      <section className="border-t-2 border-ink px-5 py-11">
        <Suspense fallback={<GapsSkeleton />}>
          <Gaps />
        </Suspense>
      </section>

      {/* ------------------------------------------------------ progression -- */}
      <section className="border-t-2 border-ink px-5 py-11">
        <div className="mx-auto max-w-[1400px]">
          <Reveal index={2}>
            <Suspense fallback={<BadgesSkeleton />}>
              <Badges />
            </Suspense>
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
            <Suspense fallback={<ListSkeleton label="Build with" />}>
              <BuildWith />
            </Suspense>
          </div>

          <div className="px-5 py-11">
            <Suspense fallback={<ListSkeleton label="On your radar" />}>
              <OnYourRadar />
            </Suspense>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------- sections -- */

async function HeroAlignment() {
  const alignment = await getAlignment();
  return (
    <span>
      Alignment{" "}
      <span className="text-ink">
        <Counter value={alignment.currentPct} suffix="%" />
      </span>{" "}
      · {alignment.roleCount} roles surveyed {alignment.yearsCovered}
    </span>
  );
}

async function NextQuest() {
  return <QuestCard quest={await getNextQuest()} />;
}

async function Stats() {
  // Started together: the three reads are independent, and awaiting them in
  // sequence here would serialise three warehouse round trips.
  const [alignment, opportunities, peers] = await Promise.all([
    getAlignment(),
    getOpportunities(),
    getPeers(),
  ]);
  const closingSoon = opportunities.filter(
    (o) => o.deadline && new Date(o.deadline).getTime() - Date.now() < 7 * 86_400_000,
  ).length;

  return (
    <>
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
    </>
  );
}

async function Gaps() {
  const alignment = await getAlignment();
  return (
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
            Measured against {alignment.roleCount} roles that recruited on
            campus between {alignment.yearsCovered}. The bar is how often the
            skill was required; the figure in red is what closing it adds to
            your alignment.
          </p>
        </Reveal>
        <Reveal index={4} className="mt-6">
          <ButtonLink href="/time-machine" variant="outline" arrow size="sm">
            Open the Time Machine
          </ButtonLink>
        </Reveal>
      </div>

      <div>
        <GapList gaps={alignment.gaps} />
      </div>
    </div>
  );
}

async function Badges() {
  return <BadgeShelf badges={await getBadges()} />;
}

async function BuildWith() {
  const peers = await getPeers();
  return (
    <>
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
    </>
  );
}

async function OnYourRadar() {
  const opportunities = await getOpportunities();
  const nowIso = new Date().toISOString();
  return (
    <>
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
    </>
  );
}

/* ------------------------------------------------------------ fallbacks -- */

function StatsSkeleton() {
  return (
    <LoadingRegion label="Loading your figures">
      {Array.from({ length: 4 }, (_, i) => (
        <div
          key={i}
          className="flex items-baseline gap-4 border-b-2 border-ink px-6 py-5 last:border-b-0"
        >
          <Skeleton className="h-9 w-[2.2ch]" />
          <Skeleton className="h-3 w-14" />
          <Skeleton className="ml-auto h-3 w-24" />
        </div>
      ))}
    </LoadingRegion>
  );
}

function GapsSkeleton() {
  return (
    <LoadingRegion label="Loading your skill gaps">
      <div className="grid gap-10 lg:grid-cols-[24rem_1fr] lg:gap-16">
        <div>
          <Skeleton className="h-3 w-32" />
          <Skeleton className="mt-4 h-7 w-full" />
          <Skeleton className="mt-2 h-7 w-2/3" />
          <Skeleton className="mt-5 h-3 w-full" />
          <Skeleton className="mt-1.5 h-3 w-5/6" />
        </div>
        <div className="flex flex-col gap-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i}>
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="mt-2 h-2.5 w-full" />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

function BadgesSkeleton() {
  return (
    <LoadingRegion label="Loading your progression">
      <Skeleton className="h-3 w-44" />
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="border-2 border-line-soft px-4 py-3">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-full" />
            <Skeleton className="mt-1.5 h-3 w-4/5" />
          </div>
        ))}
      </div>
    </LoadingRegion>
  );
}

function ListSkeleton({ label }: { label: string }) {
  return (
    <LoadingRegion label={`Loading ${label.toLowerCase()}`}>
      <Skeleton className="mb-7 h-3 w-56" />
      <div className="flex flex-col gap-5">
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </LoadingRegion>
  );
}
