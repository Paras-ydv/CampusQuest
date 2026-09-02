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
