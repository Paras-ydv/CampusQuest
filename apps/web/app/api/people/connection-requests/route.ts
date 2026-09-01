import { ConnectionRequest, ConnectionRequestInput } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createConnectionRequest, listConnectionRequests } from "@/lib/connection-requests";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const user = await requireUser(request); return Response.json(ConnectionRequest.array().parse(await listConnectionRequests(request, user.id))); }
  catch (error) { return errorResponse(error, "Could not load connection requests"); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(request); const input = ConnectionRequestInput.parse(await request.json()); return Response.json(ConnectionRequest.parse(await createConnectionRequest(request, user.id, input)), { status: 201 }); }
  catch (error) { return errorResponse(error, "Could not create connection request"); }
}
