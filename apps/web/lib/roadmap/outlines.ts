import { RoadmapOutline } from "@campusquest/shared";
import { referencedSlugs, roadmapForSkill, type RoadmapLink } from "./skill-map";

/**
 * ===========================================================================
 *  OUTLINES
 * ===========================================================================
 * Loads a reviewed outline from `./outlines/<slug>.json`.
 *
 * These are committed data, not a cache. They are derived from roadmap.sh's
 * canvas by `scripts/roadmap/derive-outline.mjs` and then corrected by hand,
 * because the upstream grouping is geometric and the derivation gets roughly
 * one subtopic in seven wrong. Re-deriving at request time would reintroduce
 * exactly the errors the review removed.
 *
 * The import is dynamic so a request for the Docker outline does not pull the
 * other thirty-four into memory.
 */

const KNOWN = new Set(referencedSlugs());

/** Guards the dynamic import against anything not in the committed catalogue. */
export function isKnownSlug(slug: string): boolean {
  return KNOWN.has(slug);
}

const cache = new Map<string, RoadmapOutline>();

export async function loadOutline(slug: string): Promise<RoadmapOutline | null> {
  if (!isKnownSlug(slug)) return null;
  const hit = cache.get(slug);
  if (hit) return hit;

  let raw: unknown;
  try {
    raw = (await import(`./outlines/${slug}.json`)).default;
  } catch {
    // A slug in the skill map with no committed outline yet. Not fatal: the
    // roadmap panel just does not render for that skill.
    return null;
  }

  const parsed = RoadmapOutline.safeParse(raw);
  if (!parsed.success) {
    console.error(`[roadmap] outline ${slug} does not match the schema`, parsed.error.issues);
    return null;
  }
  cache.set(slug, parsed.data);
  return parsed.data;
}

export type SkillRoadmap = {
  link: RoadmapLink;
  outline: RoadmapOutline;
};

/** The outline for a CampusQuest skill, or null when nothing honest maps to it. */
export async function outlineForSkill(skillId: string): Promise<SkillRoadmap | null> {
  const link = roadmapForSkill(skillId);
  if (!link) return null;
  const outline = await loadOutline(link.slug);
  return outline ? { link, outline } : null;
}

/** Every leaf a student can tick, in reading order. Headings are not leaves. */
export function leafNodeIds(outline: RoadmapOutline): string[] {
  return outline.topics.flatMap((topic) => topic.subtopics.map((s) => s.nodeId));
}
