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
  /**
   * Roles the student clears the 50% weighted-coverage bar on. This is the
   * honest headline: "you match N of M historical role profiles", never a
   * hiring probability.
   */
  alignedRoleCount: z.number().int().nonnegative().default(0),
  yearsCovered: z.string(),
  targetRole: z.string(),
  /** The family the goal role resolved to, i.e. what was actually queried. */
  roleFamily: z.string().default(""),
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
  /** Aligned-role counts either side of the change, for an honest headline. */
  fromAlignedRoleCount: z.number().int().nonnegative().default(0),
  toAlignedRoleCount: z.number().int().nonnegative().default(0),
});
export type SimulateResponse = z.infer<typeof SimulateResponse>;

/** One row of the "what did companies actually ask for" view. */
export const HistoricalRole = z.object({
  id: Id,
  title: z.string(),
  company: z.string(),
  year: z.number().int(),
  requiredSkills: z.array(Skill),
  /** Skills this role treats as hard requirements, a subset of the above. */
  coreSkills: z.array(Skill).default([]),
  matchPct: Percent,
  /** True when the student clears the 50% weighted-coverage bar. */
  aligned: z.boolean().default(false),
});
export type HistoricalRole = z.infer<typeof HistoricalRole>;
