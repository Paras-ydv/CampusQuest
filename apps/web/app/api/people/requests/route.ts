import { ConnectionRequestDetail } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listPendingRequests } from "@/lib/connection-requests";

export const dynamic = "force-dynamic";

/** Pending requests in both directions, with the other person attached. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(ConnectionRequestDetail.array().parse(await listPendingRequests(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load connection requests");
  }
}
