import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listConnectedPeers } from "@/lib/connection-requests";

export const dynamic = "force-dynamic";

/** Who the caller may message. Polled by the messages pane, so kept cheap. */
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(await listConnectedPeers(request, user.id));
  } catch (error) {
    return errorResponse(error, "Could not load connections");
  }
}
