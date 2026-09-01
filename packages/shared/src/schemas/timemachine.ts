import { z } from "zod";
import { Id, Percent } from "./common";
import { Skill, SkillGap } from "./skill";

/**
 * Placement Time Machine. Every number here is produced by parameterised SQL
 * against the Databricks warehouse (P2) so results are reproducible — an LLM
 * never generates these values.
 */
export const AlignmentResponse = z.object({
  currentPct: Percent,
  /** Historical roles the score was computed against. */
  roleCount: z.number().int().nonnegative(),
  yearsCovered: z.string(),
  targetRole: z.string(),
  gaps: z.array(SkillGap),
  heldSkills: z.array(Skill),
});
export type AlignmentResponse = z.infer<typeof AlignmentResponse>;

export const SimulateInput = z.object({
  /** Skills to pretend the student already holds. */
  skillIds: z.array(Id).min(1),
  targetRole: z.string().optional(),
});
export type SimulateInput = z.infer<typeof SimulateInput>;

export const SimulateResponse = z.object({
  fromPct: Percent,
  toPct: Percent,
  addedSkills: z.array(Skill),
  /** Historical roles the student newly aligns with. */
  unlockedRoleCount: z.number().int().nonnegative(),
  unlockedRoleTitles: z.array(z.string()),
  unlockedOpportunityCount: z.number().int().nonnegative(),
});
export type SimulateResponse = z.infer<typeof SimulateResponse>;

/** One row of the "what did companies actually ask for" view. */
export const HistoricalRole = z.object({
  id: Id,
  title: z.string(),
  company: z.string(),
  year: z.number().int(),
  requiredSkills: z.array(Skill),
  matchPct: Percent,
});
export type HistoricalRole = z.infer<typeof HistoricalRole>;
