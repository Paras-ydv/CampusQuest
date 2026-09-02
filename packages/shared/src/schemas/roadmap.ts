import { z } from "zod";

/**
 * ===========================================================================
 *  ROADMAPS
 * ===========================================================================
 * A learning outline for one skill, sourced from roadmap.sh.
 *
 * Two things are worth knowing about the upstream shape before reading this:
 *
 * 1. roadmap.sh has no semantic tree. Its graph is a React Flow canvas, and a
 *    subtopic belongs to a topic because of where it sits on that canvas —
 *    fewer than half of them have an edge saying so. The outline below is
 *    therefore *derived* by `scripts/roadmap/derive-outline.mjs` and reviewed
 *    by hand, not fetched at request time.
 *
 * 2. Topic bodies are fetched one at a time. A whole roadmap is 47-152KB; a
 *    single topic is about 1.3KB. The student only ever pays for the topic
 *    they opened.
 */

/** roadmap.sh's own node id, e.g. "jhwe-xfVc-C7qy8YuS5dZ". Stable across edits. */
export const RoadmapNodeId = z.string().min(1);

/**
 * A leaf the student can actually study and tick off.
 *
 * `nodeId` is what addresses the body on roadmap.sh, so a subtopic without one
 * cannot be opened. Group headings derived from a section box have no upstream
 * node, which is why the parent's id is allowed to be synthetic (see below) but
 * a subtopic's is not.
 */
export const RoadmapSubtopic = z.object({
  nodeId: RoadmapNodeId,
  label: z.string().min(1),
});
export type RoadmapSubtopic = z.infer<typeof RoadmapSubtopic>;

/**
 * A heading with its leaves.
 *
 * `nodeId` is usually a real roadmap.sh topic. It may also be `section:<id>`
 * for a group that exists only as a box on the canvas — roadmap.sh uses those
 * for prerequisite blocks, and they have no body to fetch. `hasBody`
 * distinguishes the two so the UI never offers to open something that 404s.
 */
export const RoadmapTopic = z.object({
  nodeId: RoadmapNodeId,
  label: z.string().min(1),
  hasBody: z.boolean().default(true),
  subtopics: z.array(RoadmapSubtopic).default([]),
});
export type RoadmapTopic = z.infer<typeof RoadmapTopic>;

export const RoadmapOutline = z.object({
  /** roadmap.sh slug, e.g. "docker". */
  slug: z.string().min(1),
  title: z.string().min(1),
  /**
   * Whether a human has checked the derived grouping.
   *
   * Grouping is inferred from canvas geometry and is wrong often enough to
   * matter, so this is the difference between "we believe this" and "a machine
   * guessed this". The UI marks an unreviewed outline, and the generator
   * refuses to overwrite a reviewed file without `--force`.
   */
  reviewed: z.boolean().default(false),
  topics: z.array(RoadmapTopic).default([]),
});
export type RoadmapOutline = z.infer<typeof RoadmapOutline>;

/** How roadmap.sh classifies a link on a topic. Open set — unknown kinds pass through. */
export const RoadmapResourceType = z.string().min(1);

export const RoadmapResource = z.object({
  type: RoadmapResourceType,
  title: z.string().min(1),
  url: z.string().url(),
});
export type RoadmapResource = z.infer<typeof RoadmapResource>;

/**
 * One topic's body, fetched on demand.
 *
 * `description` is roadmap.sh's own prose and is licensed all-rights-reserved,
 * so it is only populated when `CAMPUSQUEST_ROADMAP_INLINE_PROSE` is set. It is
 * null otherwise and the UI links out instead — see `lib/roadmap/source.ts`.
 * `resources` are outbound third-party links (docs.docker.com and the like) and
 * are always available.
 */
export const RoadmapTopicBody = z.object({
  slug: z.string().min(1),
  nodeId: RoadmapNodeId,
  label: z.string().min(1),
  description: z.string().nullable().default(null),
  resources: z.array(RoadmapResource).default([]),
  /** Canonical roadmap.sh URL for this topic, always safe to link. */
  url: z.string().url(),
});
export type RoadmapTopicBody = z.infer<typeof RoadmapTopicBody>;

/* ------------------------------------------------------------- progress -- */

/**
 * Deliberately weaker than `UserSkill.source`. Ticking a subtopic is a
 * self-report and never promotes a skill to `verified` on its own — that stays
 * the quest engine's job, so the badge rule ("nothing awarded for what the
 * student did not do") still holds.
 */
export const TopicProgressStatus = z.enum(["unseen", "learning", "done"]);
export type TopicProgressStatus = z.infer<typeof TopicProgressStatus>;

export const TopicProgress = z.object({
  slug: z.string().min(1),
  nodeId: RoadmapNodeId,
  status: TopicProgressStatus,
});
export type TopicProgress = z.infer<typeof TopicProgress>;

export const SetTopicProgressInput = z.object({
  slug: z.string().min(1),
  nodeId: RoadmapNodeId,
  status: TopicProgressStatus,
});
export type SetTopicProgressInput = z.infer<typeof SetTopicProgressInput>;

/** An outline with the current student's progress folded in. */
export const RoadmapWithProgress = z.object({
  outline: RoadmapOutline,
  progress: z.array(TopicProgress).default([]),
  /** Share of leaf subtopics marked done, 0-100. */
  completedPct: z.number().min(0).max(100).default(0),
  /**
   * False when the progress table is not present in this database — i.e. the
   * roadmap migration has not been applied yet. The outline still renders, but
   * the UI says ticks will not be saved rather than accepting them and
   * silently dropping them on the floor.
   */
  progressAvailable: z.boolean().default(true),
});
export type RoadmapWithProgress = z.infer<typeof RoadmapWithProgress>;

/* ----------------------------------------------------------- assessment -- */

/**
 * ===========================================================================
 *  ASSESSMENTS
 * ===========================================================================
 * A ten-question check a student can take once they have ticked every leaf of
 * a roadmap. Passing adds the skill to their profile and awards experience,
 * so unlike the ticks it grades, this one has to be worth something.
 *
 * That is why the answer key is not in `Assessment`. The questions go out with
 * a signed `token` that carries the key; the answers come back with the token
 * and are marked on the server. Sending the key to the browser and grading it
 * there would mean handing the student the answers to a test that pays.
 *
 * Questions are generated per attempt rather than drawn from a stored bank, so
 * retaking is not a memory test of the last attempt.
 */

/** One question as the student sees it. The key is deliberately absent. */
export const AssessmentQuestion = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  /** Exactly four, in the order they are shown. */
  options: z.array(z.string().min(1)).length(4),
});
export type AssessmentQuestion = z.infer<typeof AssessmentQuestion>;

export const Assessment = z.object({
  slug: z.string().min(1),
  /** The subject the questions were generated for, e.g. "Docker". */
  topic: z.string().min(1),
  /** Percentage needed to pass. */
  passMark: z.number().int().min(1).max(100),
  questions: z.array(AssessmentQuestion).min(1),
  /**
   * The signed answer key for this attempt, opaque to the client and returned
   * unmodified when submitting. Tampering with it fails the signature check.
   */
  token: z.string().min(1),
});
export type Assessment = z.infer<typeof Assessment>;

export const GradeAssessmentInput = z.object({
  token: z.string().min(1),
  /** Chosen option index, keyed by question id. Missing ids count as wrong. */
  answers: z.record(z.string().min(1), z.number().int().min(0).max(3)),
});
export type GradeAssessmentInput = z.infer<typeof GradeAssessmentInput>;

/** The key, revealed with the result so the review can show what was right. */
export const AssessmentAnswer = z.object({
  id: z.string().min(1),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().nullable().default(null),
});
export type AssessmentAnswer = z.infer<typeof AssessmentAnswer>;

/**
 * What passing was worth.
 *
 * `skillId` is null when the roadmap only covers the skill broadly — passing a
 * Machine Learning assessment is not evidence of PyTorch — and when the skill
 * is already held by a stronger route than this one.
 */
export const AssessmentAward = z.object({
  skillId: z.string().min(1).nullable().default(null),
  skillName: z.string().min(1).nullable().default(null),
  xpAwarded: z.number().int().nonnegative(),
  xp: z.number().int().nonnegative(),
  level: z.number().int().positive(),
  leveledUp: z.boolean(),
});
export type AssessmentAward = z.infer<typeof AssessmentAward>;

export const AssessmentResult = z.object({
  passed: z.boolean(),
  scorePct: z.number().int().min(0).max(100),
  correctCount: z.number().int().nonnegative(),
  total: z.number().int().positive(),
  answers: z.array(AssessmentAnswer),
  /** Null when the attempt did not pass, or when nothing could be recorded. */
  award: AssessmentAward.nullable().default(null),
});
export type AssessmentResult = z.infer<typeof AssessmentResult>;

/** Which roadmaps this student has ticked end to end — i.e. can be assessed. */
export const CompletedRoadmaps = z.object({
  slugs: z.array(z.string().min(1)).default([]),
});
export type CompletedRoadmaps = z.infer<typeof CompletedRoadmaps>;
