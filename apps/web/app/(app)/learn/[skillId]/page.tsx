import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { RoadmapFlow } from "@/components/app/roadmap-flow";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label } from "@/components/ui/primitives";
import { ButtonLink } from "@/components/ui/button";
import { ALL_SKILLS } from "@/lib/data/skills";
import { getSkillRoadmap } from "@/lib/data/server";

type Params = { params: Promise<{ skillId: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { skillId } = await params;
  const skill = ALL_SKILLS.find((s) => s.id === skillId);
  return { title: skill ? `Learn ${skill.name}` : "Learn" };
}

/**
 * The learning outline for one skill.
 *
 * The outline itself is committed data, so this page costs a Supabase read for
 * the student's ticks and nothing else. Individual topic bodies are fetched by
 * the tree only when a topic is opened.
 */
export default async function LearnPage({ params }: Params) {
  const { skillId } = await params;
  const skill = ALL_SKILLS.find((s) => s.id === skillId);
  if (!skill) notFound();

  const roadmap = await getSkillRoadmap(skillId);

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Learn</Label>
        <WordRise
          as="h1"
          text={skill.name}
          className="k-display max-w-[16ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={5} className="mt-6 max-w-[58ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            {roadmap
              ? "Work through a topic at a time. Ticking a subtopic tracks your progress — earning the skill on your profile still takes a quest with something to show for it."
              : `No published roadmap covers ${skill.name} yet, so there is nothing here to work through.`}
          </p>
        </Reveal>
        <Reveal index={6} className="mt-6">
          <ButtonLink href="/time-machine" variant="outline" arrow size="sm">
            Back to your gaps
          </ButtonLink>
        </Reveal>
      </section>

      {roadmap ? (
        <section className="px-5 py-9">
          <RoadmapFlow
            data={roadmap}
            note={roadmap.link.match === "broader" ? roadmap.link.note : undefined}
          />
        </section>
      ) : null}
    </div>
  );
}
