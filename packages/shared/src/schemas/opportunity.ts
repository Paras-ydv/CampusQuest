import { z } from "zod";
import { Id, IsoDate, Percent } from "./common";
import { Skill } from "./skill";

export const OpportunityKind = z.enum([
  "internship",
  "hackathon",
  "competition",
  "research",
  "oss",
  "workshop",
  "scholarship",
  "event",
]);
export type OpportunityKind = z.infer<typeof OpportunityKind>;

export const Difficulty = z.enum(["intro", "intermediate", "advanced"]);
export type Difficulty = z.infer<typeof Difficulty>;

export const Opportunity = z.object({
  id: Id,
  title: z.string(),
  org: z.string(),
  kind: OpportunityKind,
  description: z.string(),
  /** Null for rolling / always-open opportunities such as OSS issues. */
  deadline: IsoDate.nullable().default(null),
  requiredSkills: z.array(Skill),
  skillsGained: z.array(Skill),
  difficulty: Difficulty,
  /** How well it fits this student. Computed server-side, not in the UI. */
  matchPct: Percent,
  /** Which of the student's gaps this would close. */
  closesGapIds: z.array(Id),
  url: z.string(),
  saved: z.boolean().default(false),
  source: z.string(),
});
export type Opportunity = z.infer<typeof Opportunity>;

export const OpportunityQuery = z.object({
  kinds: z.array(OpportunityKind).optional(),
  difficulty: Difficulty.optional(),
  closingWithinDays: z.number().int().positive().optional(),
  savedOnly: z.boolean().optional(),
  search: z.string().optional(),
});
export type OpportunityQuery = z.infer<typeof OpportunityQuery>;

export const ToggleSavedInput = z.object({
  opportunityId: Id,
  saved: z.boolean(),
});
export type ToggleSavedInput = z.infer<typeof ToggleSavedInput>;
