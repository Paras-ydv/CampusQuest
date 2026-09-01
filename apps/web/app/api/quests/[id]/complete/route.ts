import { CompleteQuestResult } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { completeQuest } from "@/lib/quest-engine";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    if (!id) throw new Error("NOT_FOUND");
    return Response.json(CompleteQuestResult.parse(await completeQuest(request, user.id, id)));
  } catch (error) {
    return errorResponse(error, "Could not complete quest");
  }
}
