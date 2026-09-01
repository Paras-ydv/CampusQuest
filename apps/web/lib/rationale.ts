import { genieNarrative } from "@/lib/genie";

export type RecommendationEvidence = {
  studentId: string;
  kind: "quest" | "person" | "opportunity" | "research";
  title: string;
  facts: string[];
};

/** Narrative-only helper: ranking and all numeric facts must be calculated upstream. */
export async function recommendationRationale(evidence: RecommendationEvidence): Promise<string> {
  const facts = evidence.facts.filter(Boolean).slice(0, 8).join("\n- ");
  return genieNarrative(
    evidence.studentId,
    `Write a concise CampusQuest ${evidence.kind} recommendation narrative for "${evidence.title}". Use only these verified facts; do not add or alter any number.\n- ${facts}`,
  );
}
