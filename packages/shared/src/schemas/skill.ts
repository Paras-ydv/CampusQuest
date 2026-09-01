import { z } from "zod";
import { Id, Percent } from "./common";

export const SkillCategory = z.enum([
  "language",
  "framework",
  "infra",
  "data",
  "ml",
  "systems",
  "tooling",
  "practice",
]);
export type SkillCategory = z.infer<typeof SkillCategory>;

/** How far along the student is with a skill they hold. */
export const Proficiency = z.enum(["learning", "working", "strong"]);
export type Proficiency = z.infer<typeof Proficiency>;

/** Where the skill claim came from. Quest-earned skills are the trustworthy ones. */
export const SkillSource = z.enum(["self", "quest", "verified"]);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: Id,
  name: z.string(),
  category: SkillCategory,
});
export type Skill = z.infer<typeof Skill>;

export const UserSkill = z.object({
  skill: Skill,
  proficiency: Proficiency,
  source: SkillSource,
});
export type UserSkill = z.infer<typeof UserSkill>;

/**
 * A skill the student does not hold that historical roles kept asking for.
 * Produced by Databricks SQL (P2), never by an LLM.
 */
export const SkillGap = z.object({
  skill: Skill,
  /** Share of surveyed roles that required this skill. */
  frequencyPct: Percent,
  /** Points of alignment gained by closing this gap. */
  impactPct: Percent,
  /** How many historical roles were surveyed to produce the above. */
  roleCount: z.number().int().nonnegative(),
});
export type SkillGap = z.infer<typeof SkillGap>;

export const AddSkillInput = z.object({
  skillId: Id,
  proficiency: Proficiency,
});
export type AddSkillInput = z.infer<typeof AddSkillInput>;
