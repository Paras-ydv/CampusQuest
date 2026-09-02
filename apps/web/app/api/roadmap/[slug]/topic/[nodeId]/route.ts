import { RoadmapTopicBody } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { loadOutline } from "@/lib/roadmap/outlines";
import { fetchTopicBody } from "@/lib/roadmap/source";

export const dynamic = "force-dynamic";

/**
 * One topic body, about 1.3KB, fetched from roadmap.sh when a student opens it.
 * This is the endpoint that makes the whole integration cheap: nothing pulls a
 * complete roadmap at request time.
 *
 * The label comes from our own outline rather than the caller, so a topic can
 * never be titled by whoever crafted the URL.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; nodeId: string }> },
) {
  try {
    await requireUser(request);
    const { slug, nodeId } = await context.params;
    const outline = await loadOutline(slug);
    if (!outline) throw new Error("NOT_FOUND");

    const known = outline.topics.flatMap((topic) => [
      { nodeId: topic.nodeId, label: topic.label, hasBody: topic.hasBody },
      ...topic.subtopics.map((s) => ({ nodeId: s.nodeId, label: s.label, hasBody: true })),
    ]);
    const entry = known.find((n) => n.nodeId === nodeId);
    if (!entry || !entry.hasBody) throw new Error("NOT_FOUND");

    const body = await fetchTopicBody(slug, nodeId, entry.label);
    if (!body) throw new Error("NOT_FOUND");
    return Response.json(RoadmapTopicBody.parse(body));
  } catch (error) {
    return errorResponse(error, "Could not load topic");
  }
}
