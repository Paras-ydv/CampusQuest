import { errorResponse, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getHistoricalRoles } from "@/lib/timemachine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(await getHistoricalRoles(request, user.id, parseQuery(request).targetRole));
  } catch (error) { return errorResponse(error, "Could not load historical roles"); }
}
