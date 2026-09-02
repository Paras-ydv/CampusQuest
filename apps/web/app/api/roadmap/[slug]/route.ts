import { RoadmapWithProgress } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { loadOutline } from "@/lib/roadmap/outlines";
import { roadmapWithProgress } from "@/lib/roadmap/progress";

export const dynamic = "force-dynamic";

/**
 * The outline for one roadmap, with this student's ticks folded in.
 *
 * Serves committed data plus one small Supabase read — it never touches
 * roadmap.sh. Topic bodies are a separate request precisely so opening this
 * does not drag 47-152KB of someone else's roadmap across the wire.
 */
export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  try {
    const user = await requireUser(request);
    const { slug } = await context.params;
    const outline = await loadOutline(slug);
    if (!outline) throw new Error("NOT_FOUND");
    return Response.json(
      RoadmapWithProgress.parse(await roadmapWithProgress(request, user.id, outline)),
    );
  } catch (error) {
    return errorResponse(error, "Could not load roadmap");
  }
}
