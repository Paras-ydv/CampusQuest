import { GenieAskInput } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { genieSseResponse } from "@/lib/genie";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    const input = GenieAskInput.pick({ question: true }).parse(await request.json());
    return genieSseResponse({ request, userId: user.id, question: input.question, conversationId: id });
  } catch (error) { return errorResponse(error, "Could not continue Genie conversation"); }
}
