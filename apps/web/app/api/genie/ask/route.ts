import { GenieAskInput } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { genieSseResponse } from "@/lib/genie";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = GenieAskInput.parse(await request.json());
    return genieSseResponse({ request, userId: user.id, question: input.question, conversationId: input.conversationId });
  } catch (error) { return errorResponse(error, "Could not start Genie conversation"); }
}
