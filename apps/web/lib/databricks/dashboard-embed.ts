import { createHash } from "node:crypto";

/**
 * Mints the short-lived, per-viewer token that lets a signed-in CampusQuest
 * student load the embedded AI/BI placement dashboard.
 *
 * Students do not have Databricks accounts and never will, so the basic
 * embedding path — which prompts the viewer to sign in to the workspace — is
 * not usable here. This is Databricks' "embedding for external users" flow:
 * the app authenticates as a service principal and hands the browser a token
 * scoped to one published dashboard.
 *
 * Three calls, in this order, and the order is the point:
 *
 *   1. client_credentials against the workspace OIDC endpoint, using the
 *      service principal secret. This token can call every dashboard API the
 *      principal can, so it must never leave the server.
 *   2. `tokeninfo` on the published dashboard, which returns the
 *      authorization_details describing access to *that dashboard only*.
 *   3. client_credentials again, this time presenting those details, which
 *      returns a token carrying exactly that scope.
 *
 * Only the third token is sent to the browser. Skipping to step 1 and
 * returning that token would work — the dashboard would render — and would
 * hand every visitor a credential for the whole workspace. The scoping is the
 * entire security model, not a nicety.
 */

type TokenResponse = { access_token?: string; expires_in?: number; error_description?: string };
type TokenInfo = { authorization_details?: unknown; scope?: string; custom_claim?: string };

export type DashboardEmbedConfig = {
  instanceUrl: string;
  workspaceId: string;
  dashboardId: string;
};

function trimmedHost(): string {
  return (process.env.DATABRICKS_HOST ?? "").replace(/\/$/, "");
}

/**
 * Every value the browser component needs, none of them secret. Read as a
 * group so a half-configured deployment fails at the route with a clear
 * message rather than in the iframe with a blank panel.
 */
export function dashboardEmbedConfig(): DashboardEmbedConfig | null {
  const instanceUrl = trimmedHost();
  const workspaceId = process.env.DATABRICKS_WORKSPACE_ID ?? "";
  const dashboardId = process.env.DATABRICKS_DASHBOARD_ID ?? "";
  if (!instanceUrl || !workspaceId || !dashboardId) return null;
  return { instanceUrl, workspaceId, dashboardId };
}

export function dashboardEmbedConfigured(): boolean {
  return Boolean(
    dashboardEmbedConfig() &&
      process.env.DATABRICKS_DASHBOARD_CLIENT_ID &&
      process.env.DATABRICKS_DASHBOARD_CLIENT_SECRET,
  );
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required to embed the placement dashboard`);
  return value;
}

async function oauthToken(body: URLSearchParams): Promise<string> {
  const credentials = Buffer.from(
    `${required("DATABRICKS_DASHBOARD_CLIENT_ID")}:${required("DATABRICKS_DASHBOARD_CLIENT_SECRET")}`,
  ).toString("base64");
  const response = await fetch(`${trimmedHost()}/oidc/v1/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
    cache: "no-store",
  });
  const payload = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    throw new Error(`Databricks token request failed (${response.status})`);
  }
  return payload.access_token;
}

/**
 * A stable, non-identifying handle for the viewer.
 *
 * Databricks records `external_viewer_id` in its own query history and audit
 * log. Sending the raw Supabase user id would copy our user identifiers into a
 * second system's logs for no gain, so it is hashed: the same student is the
 * same viewer across sessions, which is all the audit trail needs, and the
 * value cannot be joined back to a person without our database.
 */
function externalViewerId(userId: string): string {
  return createHash("sha256").update(`campusquest-dashboard-viewer\n${userId}`).digest("hex").slice(0, 32);
}

/** Returns a token scoped to the published placement dashboard, valid for one hour. */
export async function mintDashboardToken(userId: string): Promise<{ token: string; expiresInSeconds: number }> {
  const config = dashboardEmbedConfig();
  if (!config) throw new Error("Placement dashboard embedding is not configured");

  const broadToken = await oauthToken(new URLSearchParams({ grant_type: "client_credentials", scope: "all-apis" }));

  const infoUrl = new URL(
    `${config.instanceUrl}/api/2.0/lakeview/dashboards/${encodeURIComponent(config.dashboardId)}/published/tokeninfo`,
  );
  infoUrl.searchParams.set("external_viewer_id", externalViewerId(userId));
  // Every student sees the same campus-wide aggregates, so there is no
  // per-viewer row filter to carry. Should a panel ever need one, this is the
  // value the dashboard reads as __aibi_external_value.
  infoUrl.searchParams.set("external_value", "campus");

  const infoResponse = await fetch(infoUrl, {
    headers: { Authorization: `Bearer ${broadToken}` },
    cache: "no-store",
  });
  if (!infoResponse.ok) {
    throw new Error(`Databricks dashboard tokeninfo failed (${infoResponse.status})`);
  }
  const info = (await infoResponse.json()) as TokenInfo;
  if (!info.authorization_details) {
    throw new Error("Databricks returned no authorization details for the dashboard");
  }

  // All three fields tokeninfo returns are sent back, not just the
  // authorization details. The exchange succeeds with the details alone — which
  // is the trap — but `custom_claim` is what carries
  // `urn:aibi:external_data:<external_value>:<external_viewer_id>`. Drop it and
  // the token is no longer bound to a viewer: the hashed id never reaches the
  // audit log and `__aibi_external_value` is unset for any panel that later
  // needs to filter by it.
  const token = await oauthToken(
    new URLSearchParams({
      grant_type: "client_credentials",
      authorization_details: JSON.stringify(info.authorization_details),
      ...(info.scope ? { scope: info.scope } : {}),
      ...(info.custom_claim ? { custom_claim: info.custom_claim } : {}),
    }),
  );
  // Databricks caps embedding tokens at one hour; the client refreshes ahead of that.
  return { token, expiresInSeconds: 3600 };
}
