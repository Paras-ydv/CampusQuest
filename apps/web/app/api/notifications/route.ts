import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { Notification, listNotifications } from "@/lib/notifications";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(Notification.array().parse(await listNotifications(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load notifications");
  }
}
