import { ConnectionRequest } from "@campusquest/shared";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { respondToConnectionRequest } from "@/lib/connection-requests";

const Action = z.object({ status: z.enum(["accepted", "rejected", "cancelled"]) });
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser(request); const { id } = await context.params;
    return Response.json(ConnectionRequest.parse(await respondToConnectionRequest(request, user.id, id, Action.parse(await request.json()).status)));
  } catch (error) { return errorResponse(error, "Could not update connection request"); }
}
