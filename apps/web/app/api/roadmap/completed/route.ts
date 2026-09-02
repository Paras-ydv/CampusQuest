import { CompletedRoadmaps } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { completedSlugs } from "@/lib/roadmap/progress";

export const dynamic = "force-dynamic";

/**
 * The roadmaps this student has ticked end to end.
 *
 * The gap list asks once and matches slugs locally, so showing "take the
 * assessment" on a page of thirty skills stays one request rather than thirty.
 */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(CompletedRoadmaps.parse({ slugs: await completedSlugs(request, user.id) }));
  } catch (error) {
    return errorResponse(error, "Could not load roadmap completion");
  }
}
