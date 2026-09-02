import { z } from "zod";
import { Id, IsoDate } from "./common";
import { Skill } from "./skill";

export const QuestRarity = z.enum(["common", "rare", "epic", "legendary"]);
export type QuestRarity = z.infer<typeof QuestRarity>;

export const QuestCategory = z.enum([
  "build",
  "learn",
  "compete",
  "contribute",
  "research",
  "connect",
]);
export type QuestCategory = z.infer<typeof QuestCategory>;

export const QuestStatus = z.enum(["available", "active", "completed"]);
export type QuestStatus = z.infer<typeof QuestStatus>;

export const QuestStep = z.object({
  id: Id,
  label: z.string(),
  done: z.boolean().default(false),
  verification: z.enum(["github_file", "github_workflow", "manual"]).optional(),
  verifiedAt: IsoDate.nullable().optional(),
  verifiedCommit: z.string().nullable().optional(),
  verificationMessage: z.string().nullable().optional(),
});
export type QuestStep = z.infer<typeof QuestStep>;

export const Quest = z.object({
  id: Id,
  title: z.string(),
  summary: z.string(),
  category: QuestCategory,
  rarity: QuestRarity,
  xp: z.number().int().positive(),
  /** Skills the student holds once the quest is completed. */
  skillsGained: z.array(Skill),
  steps: z.array(QuestStep),
  estimatedHours: z.number().positive(),
  /**
   * Data-backed justification. Written by Genie (P2) from the skill-gap
   * numbers — the numbers themselves come from SQL.
   */
  why: z.string(),
  status: QuestStatus.default("available"),
  pathSkillId: Id.nullable().optional(), pathLevel: z.number().int().min(1).max(3).nullable().optional(), prerequisiteQuestId: Id.nullable().optional(), repositoryUrl: z.string().url().nullable().optional(),
});
export type Quest = z.infer<typeof Quest>;

export const CompleteQuestResult = z.object({
  questId: Id,
  xpAwarded: z.number().int().positive(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  leveledUp: z.boolean(),
  skillsGained: z.array(Skill),
  /** Alignment before and after, so the UI can animate the delta. */
  alignmentBeforePct: z.number(),
  alignmentAfterPct: z.number(),
  completedAt: IsoDate,
});
export type CompleteQuestResult = z.infer<typeof CompleteQuestResult>;
export const VerifyQuestStepInput = z.object({ repositoryUrl: z.string().url().optional() });
export const VerifyQuestStepResult = z.object({ questId: Id, stepId: Id, passed: z.boolean(), message: z.string(), commit: z.string().nullable() });
export type VerifyQuestStepResult = z.infer<typeof VerifyQuestStepResult>;
