import { z } from "zod";
import { Id, IsoDate, Percent } from "./common";
import { UserSkill } from "./skill";

export const AcademicYear = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);
export type AcademicYear = z.infer<typeof AcademicYear>;

export const Project = z.object({
  id: Id,
  title: z.string(),
  summary: z.string(),
  skillIds: z.array(Id),
  url: z.string().nullable().default(null),
});
export type Project = z.infer<typeof Project>;

export const Certification = z.object({
  id: Id,
  title: z.string(),
  issuer: z.string(),
  earnedAt: IsoDate,
});
export type Certification = z.infer<typeof Certification>;

export const Profile = z.object({
  id: Id,
  name: z.string(),
  email: z.string(),
  /** Two-letter monogram used across avatars. */
  initials: z.string().length(2),
  branch: z.string(),
  year: AcademicYear,
  /** The role the whole journey is oriented around, e.g. "AI/ML Engineer". */
  goalRole: z.string(),
  interests: z.array(z.string()),
  wantsToLearn: z.array(Id),
  skills: z.array(UserSkill),
  projects: z.array(Project),
  certifications: z.array(Certification),
  level: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  /** XP total at which the next level is reached. */
  xpToNext: z.number().int().positive(),
  /** Historical-role alignment. Computed in Databricks, never guessed. */
  alignmentPct: Percent,
  createdAt: IsoDate,
});
export type Profile = z.infer<typeof Profile>;

export const UpdateProfileInput = Profile.pick({
  name: true,
  branch: true,
  year: true,
  goalRole: true,
  interests: true,
}).partial();
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

/** What the onboarding flow submits once the student finishes all steps. */
export const OnboardingInput = z.object({
  name: z.string().min(1),
  branch: z.string().min(1),
  year: AcademicYear,
  goalRole: z.string().min(1),
  skillIds: z.array(Id),
  interests: z.array(z.string()),
});
export type OnboardingInput = z.infer<typeof OnboardingInput>;

/**
 * What `POST /api/onboarding/resume` returns.
 *
 * Extraction only ever *suggests*: the student reviews these on the skills step
 * and the existing `OnboardingInput` is still what writes anything. `skillIds`
 * are canonical taxonomy ids, never free text, because gaps and quests join on
 * them.
 */
export const ResumeExtraction = z.object({
  skillIds: z.array(Id),
  /** Per skill, the spelling found in the document — shown as provenance. */
  matches: z.array(z.object({ skillId: Id, matchedOn: z.string() })),
  /**
   * The "about you" fields, each null when the résumé did not state it
   * unambiguously. `branch` is always one of `BRANCHES` and `year` a valid
   * `AcademicYear`, since onboarding renders both as fixed choices.
   */
  name: z.string().nullable(),
  branch: z.string().nullable(),
  year: AcademicYear.nullable(),
  /**
   * Technologies the résumé names that the catalogue has no entry for, after
   * synonyms have been merged. Reported for visibility only — nothing is
   * inserted from it, so the taxonomy stays under human control.
   */
  unknownSkills: z.array(z.string()).default([]),
  /** True when the PDF carried no readable text, e.g. a scan. */
  empty: z.boolean(),
});
export type ResumeExtraction = z.infer<typeof ResumeExtraction>;
