import { AtsScore, AtsState } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getAtsState, scoreStoredResume } from "@/lib/backend/ats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Whether a résumé is stored, and the last score if there is one. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(AtsState.parse(await getAtsState(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load your ATS score");
  }
}

/**
 * Scores the stored résumé. Separate from GET because it costs a model call —
 * opening the screen must not trigger one, only asking for a score should.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(AtsScore.parse(await scoreStoredResume(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not score your résumé");
  }
}
