import { SetTopicProgressInput, TopicProgress } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setProgress } from "@/lib/roadmap/progress";

export const dynamic = "force-dynamic";

/**
 * Ticks or un-ticks one topic.
 *
 * A self-report only: this never touches `user_skills`, so it cannot promote a
 * skill to `verified`. Completing a quest with a deliverable is what does that.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = SetTopicProgressInput.parse(await request.json());
    return Response.json(TopicProgress.parse(await setProgress(request, user.id, input)));
  } catch (error) {
    return errorResponse(error, "Could not save roadmap progress");
  }
}
