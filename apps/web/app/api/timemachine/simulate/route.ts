import { SimulateInput } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { simulateTimeMachine } from "@/lib/timemachine";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = SimulateInput.parse(await request.json());
    return Response.json(await simulateTimeMachine(request, user.id, input));
  } catch (error) { return errorResponse(error, "Could not simulate Time Machine alignment"); }
}
