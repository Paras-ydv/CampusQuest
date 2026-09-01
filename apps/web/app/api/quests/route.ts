import { Quest } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listQuests } from "@/lib/quest-engine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(Quest.array().parse(await listQuests(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load quests");
  }
}
