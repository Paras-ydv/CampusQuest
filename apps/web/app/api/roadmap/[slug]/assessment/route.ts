import { Assessment } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { generateAssessment } from "@/lib/roadmap/assessment";
import { loadOutline } from "@/lib/roadmap/outlines";
import { isComplete, listProgress } from "@/lib/roadmap/progress";

export const dynamic = "force-dynamic";

/**
 * Generates one assessment attempt for a finished roadmap.
 *
 * POST rather than GET because each call is a new set of questions, not a
 * cached view of the same one — and because it costs a model call of roughly
 * twenty seconds, which is not something a prefetch should be able to trigger.
 *
 * Completion is re-checked here rather than trusted from the client. The
 * button that leads here is only rendered for a finished roadmap, but the
 * route is reachable without it, and "you have not finished this yet" is the
 * whole precondition of the feature.
 */
export async function POST(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser(request);
    const { slug } = await context.params;
    const outline = await loadOutline(slug);
    if (!outline) throw new Error("NOT_FOUND");

    const progress = await listProgress(request, user.id, slug);
    if (!progress || !isComplete(outline, progress)) throw new Error("FORBIDDEN");

    return Response.json(Assessment.parse(await generateAssessment(outline)));
  } catch (error) {
    // A model that wandered out of JSON, timed out, or is not configured at
    // all in this deployment is a bad day for the feature rather than a bug in
    // the request. The panel says so in those words and offers another go.
    if (error instanceof Error && error.message === "ASSESSMENT_UNAVAILABLE") {
      return Response.json(
        { error: "ASSESSMENT_UNAVAILABLE", message: "The assessment could not be generated right now. Try again in a moment." },
        { status: 503 },
      );
    }
    return errorResponse(error, "Could not generate the assessment");
  }
}
