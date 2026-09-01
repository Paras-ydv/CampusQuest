import type { Metadata } from "next";
import { ResearchCard } from "@/components/app/research-card";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label } from "@/components/ui/primitives";
import { getProfile, getResearch } from "@/lib/data/server";

export const metadata: Metadata = { title: "Research" };

export default async function ResearchPage() {
  const [matches, profile] = await Promise.all([getResearch(), getProfile()]);
  const heldIds = profile.skills.map((s) => s.skill.id);

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Research Matchmaker</Label>
        <WordRise
          as="h1"
          text="Who on campus works on this?"
          className="k-display max-w-[14ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={6} className="mt-6 max-w-[56ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            The path from an interest to a person: research areas, the groups
            working in them, the projects currently taking students, and the
            publications behind them. Matched against{" "}
            {profile.interests.slice(0, 3).join(", ")}.
          </p>
        </Reveal>
      </section>

      <section className="px-5 py-9">
        <Label rule className="mb-7">
          {matches.length} projects near your interests
        </Label>
        <div className="grid gap-5 lg:grid-cols-2">
          {matches.map((match, i) => (
            <Reveal key={match.project.id} index={i} className="h-full">
              <ResearchCard match={match} heldIds={heldIds} />
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-t-2 border-ink px-5 py-9">
        <p className="max-w-[62ch] font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-faint">
          Researcher and publication records are ingested from OpenAlex and arXiv
          (P4) and joined to campus research areas in Databricks. Demo data here
          is synthetic.
        </p>
      </section>
    </div>
  );
}
