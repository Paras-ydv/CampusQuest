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

/** A concrete next step for closing a gap, from `learning_resources`. */
export const LearningResource = z.object({
  id: Id,
  title: z.string(),
  provider: z.string(),
  resourceType: z.string(),
  level: z.string(),
  estimatedHours: z.number().int().nonnegative().nullable().default(null),
  isFree: z.boolean().default(true),
  url: z.string().nullable().default(null),
});
export type LearningResource = z.infer<typeof LearningResource>;

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
  /**
   * Whether roles treat this as a hard requirement or a nice-to-have. Core
   * skills count double in the alignment rule.
   */
  importance: z.enum(["core", "preferred"]).default("core"),
  /** What to actually do about it. Null when the catalogue has nothing. */
  resource: LearningResource.nullable().default(null),
});
export type SkillGap = z.infer<typeof SkillGap>;

export const AddSkillInput = z.object({
  skillId: Id,
  proficiency: Proficiency,
});
export type AddSkillInput = z.infer<typeof AddSkillInput>;
