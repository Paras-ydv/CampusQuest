import { RoadmapResource, RoadmapTopicBody } from "@campusquest/shared";
import { isKnownSlug } from "./outlines";

/**
 * ===========================================================================
 *  ROADMAP.SH — REMOTE TOPIC BODIES
 * ===========================================================================
 * One topic at a time, which is the whole point.
 *
 *   whole roadmap   47-152 KB   never fetched at request time
 *   one topic        ~1.3 KB    fetched when a student opens it
 *
 * LICENCE
 * -------
 * roadmap.sh's content is not open source. Its licence permits personal use and
 * linking, and forbids republishing the text:
 *
 *   "not allowed to use it for any other purpose including publishing ... the
 *    content ... in any form"
 *
 * So `description` — their prose — is dropped unless
 * `CAMPUSQUEST_ROADMAP_INLINE_PROSE=true` is set deliberately by whoever runs
 * this deployment. The default links out to roadmap.sh instead, which the
 * licence explicitly allows.
 *
 * `resources` are outbound links to third parties (docs.docker.com and the
 * like). Those are passed through either way, and they are what finally gives
 * `LearningResource.url` a real value instead of the null it has carried since
 * the catalogue shipped.
 */

const API = "https://roadmap.sh/api/v1-official-roadmap-topic";

/** Public page for a roadmap. Always safe to link, per the licence. */
export function roadmapUrl(slug: string): string {
  return `https://roadmap.sh/${encodeURIComponent(slug)}`;
}

/**
 * Whether to render roadmap.sh's own prose inside CampusQuest.
 *
 * Off by default on purpose — see the licence note above. This is the single
 * switch referenced by `RoadmapTopicBody.description`.
 */
export function inlineProseEnabled(): boolean {
  return process.env.CAMPUSQUEST_ROADMAP_INLINE_PROSE === "true";
}

type RemoteTopic = {
  nodeId?: unknown;
  roadmapSlug?: unknown;
  description?: unknown;
  resources?: unknown;
};

/**
 * Bodies change rarely and are tiny, so a short in-process TTL is enough to
 * stop a student re-fetching the same topic while they read it. Deliberately
 * not a database table: it would be a cache of someone else's content, which is
 * the thing the licence is most pointed about.
 */
const TTL_MS = 10 * 60 * 1000;
const memo = new Map<string, { at: number; value: RoadmapTopicBody }>();

function firstHeading(markdown: string): string | null {
  const line = markdown.split("\n").find((l) => l.startsWith("# "));
  return line ? line.slice(2).trim() : null;
}

/**
 * Fetches one topic. `label` is what the outline calls it, used when the
 * remote body has no heading of its own.
 */
export async function fetchTopicBody(
  slug: string,
  nodeId: string,
  label: string,
): Promise<RoadmapTopicBody | null> {
  // The slug is interpolated into a URL, so it is checked against the
  // committed catalogue rather than trusted from the caller.
  if (!isKnownSlug(slug)) return null;
  // Derived headings ("section:<id>") exist only in our outline; upstream has
  // no body for them and asking would be a guaranteed 404.
  if (nodeId.startsWith("section:")) return null;

  const key = `${slug}/${nodeId}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  let payload: RemoteTopic;
  try {
    const response = await fetch(
      `${API}/${encodeURIComponent(slug)}/${encodeURIComponent(nodeId)}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!response.ok) return null;
    payload = (await response.json()) as RemoteTopic;
  } catch (error) {
    // A topic that will not load is a degraded card, not a broken page — the
    // student still has the outline and the link out.
    console.warn(`[roadmap] could not load ${key} —`, error instanceof Error ? error.message : error);
    return null;
  }

  const markdown = typeof payload.description === "string" ? payload.description : "";
  const resources = Array.isArray(payload.resources)
    ? payload.resources.flatMap((entry) => {
        const parsed = RoadmapResource.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
    : [];

  const body = RoadmapTopicBody.parse({
    slug,
    nodeId,
    label: firstHeading(markdown) ?? label,
    description: inlineProseEnabled() && markdown ? markdown : null,
    resources,
    url: roadmapUrl(slug),
  });

  memo.set(key, { at: Date.now(), value: body });
  return body;
}
