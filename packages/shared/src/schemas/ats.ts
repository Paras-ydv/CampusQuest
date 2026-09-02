import { z } from "zod";
import { IsoDate } from "./common";

/**
 * ATS résumé evaluation.
 *
 * The rubric is HackerRank's own, from `interviewstreet/hiring-agent`: four
 * weighted categories, bonuses capped at 20, and deductions, giving a score
 * out of 120. Keeping their weights means the number answers a real question —
 * "how would the system that screens 50,000 intern applications read this?" —
 * rather than being a scale we invented.
 *
 * What differs is the audience. hiring-agent produces a ranking for
 * recruiters; here the same evaluation is shown to the student it describes,
 * so `improvements` is the part that matters and the score is context for it.
 */

/** One rubric category. `max` travels with the score so the UI never hard-codes weights. */
export const AtsCategory = z.object({
  score: z.number().min(0),
  max: z.number().positive(),
  /** Why this score — quoted from the résumé, never a generic statement. */
  evidence: z.string(),
});
export type AtsCategory = z.infer<typeof AtsCategory>;

/** A concrete change, ordered by how much it would move the score. */
export const AtsImprovement = z.object({
  title: z.string(),
  detail: z.string(),
  /** Which category it lifts, so the UI can point at the bar it affects. */
  category: z.string(),
  /** Estimated points gained. Indicative, not a promise. */
  points: z.number().int().min(0).max(35),
  /** A quest that would produce the evidence this improvement asks for. */
  questId: z.string().nullable().default(null),
});
export type AtsImprovement = z.infer<typeof AtsImprovement>;

export const AtsScore = z.object({
  /** 0-120: categories + bonus - deductions, clamped. */
  overall: z.number().int().min(0).max(120),
  categories: z.object({
    openSource: AtsCategory,
    selfProjects: AtsCategory,
    production: AtsCategory,
    technicalSkills: AtsCategory,
  }),
  bonus: z.object({ total: z.number().min(0).max(20), breakdown: z.string() }),
  deductions: z.object({ total: z.number().min(0), reasons: z.string() }),
  strengths: z.array(z.string()).max(5),
  improvements: z.array(AtsImprovement).max(6),
  /** Name of the document scored, so the student knows what this describes. */
  fileName: z.string().nullable().default(null),
  scoredAt: IsoDate,
  /** True when the résumé changed after this score was computed. */
  stale: z.boolean().default(false),
});
export type AtsScore = z.infer<typeof AtsScore>;

/** What `GET /api/ats` returns before anything has been scored. */
export const AtsState = z.object({
  /** False when no résumé is stored — the screen must then ask for one. */
  hasResume: z.boolean(),
  fileName: z.string().nullable().default(null),
  score: AtsScore.nullable().default(null),
});
export type AtsState = z.infer<typeof AtsState>;
