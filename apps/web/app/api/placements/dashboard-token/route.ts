import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { mintDashboardToken } from "@/lib/databricks/dashboard-embed";

export const dynamic = "force-dynamic";

/**
 * Issues the embedding token for the placement dashboard.
 *
 * POST rather than GET, and never cached. The response body is a bearer
 * credential; a GET would be a URL that lands in browser history, referrer
 * headers and any proxy log between here and the client.
 *
 * `requireUser` is the whole access rule. The dashboard is campus-wide
 * aggregate data meant for every student, so there is nothing finer to check —
 * but it must still be behind a session, because this route mints a real
 * Databricks credential and an open one would mint them for anybody.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const { token, expiresInSeconds } = await mintDashboardToken(user.id);
    return Response.json(
      { token, expiresInSeconds },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error, "Could not load the placement dashboard");
  }
}
