import { errorResponse, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getAlignment } from "@/lib/timemachine";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = parseQuery(request);
    return Response.json(await getAlignment(request, user.id, query.targetRole));
  } catch (error) { return errorResponse(error, "Could not load Time Machine alignment"); }
}
