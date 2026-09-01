import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { Badge, listBadges } from "@/lib/badges";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(Badge.array().parse(await listBadges(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load badges");
  }
}
