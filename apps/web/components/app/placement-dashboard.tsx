"use client";

import { DatabricksDashboard } from "@databricks/aibi-client";
import { useEffect, useRef, useState } from "react";

type Config = { instanceUrl: string; workspaceId: string; dashboardId: string };

async function fetchToken(): Promise<string> {
  const response = await fetch("/api/placements/dashboard-token", {
    method: "POST",
    cache: "no-store",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? "Could not authorise the placement dashboard.");
  }
  return ((await response.json()) as { token: string }).token;
}

/**
 * Hosts the published Databricks AI/BI dashboard.
 *
 * The token is fetched here rather than passed down from the server component.
 * It lives one hour, and a server-rendered page can be served from a cache or
 * sit open on a laptop for far longer than that — baking the token into the
 * HTML gives an embed that works on first load and silently dies later. The
 * SDK calls `getNewToken` on its own schedule, and it needs a live endpoint
 * behind it for that to mean anything.
 */
export function PlacementDashboard({ config }: { config: Config }) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const element = container.current;
    if (!element) return;

    let dashboard: DatabricksDashboard | null = null;
    let cancelled = false;

    void (async () => {
      try {
        const token = await fetchToken();
        // The await above yields, so the effect may already have been torn
        // down by a navigation. Rendering here would leak an iframe.
        if (cancelled) return;
        dashboard = new DatabricksDashboard({
          instanceUrl: config.instanceUrl,
          workspaceId: config.workspaceId,
          dashboardId: config.dashboardId,
          container: element,
          token,
          getNewToken: fetchToken,
          // Kinetic ships a dark theme; let the embed follow the same system
          // preference the rest of the app does rather than burning a white
          // rectangle into a dark page.
          colorScheme: "light dark",
        });
        dashboard.initialize();
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Could not load the placement dashboard.");
        }
      }
    })();

    return () => {
      cancelled = true;
      dashboard?.destroy();
    };
  }, [config.instanceUrl, config.workspaceId, config.dashboardId]);

  if (error) {
    return (
      <div role="alert" className="border-2 border-ink bg-sunk px-5 py-8">
        <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-hot uppercase">
          Dashboard unavailable
        </p>
        <p className="mt-3 max-w-[52ch] text-[0.95rem] leading-relaxed text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div
      ref={container}
      // A fixed height, not min-height: the SDK renders into an iframe that
      // sizes to its parent, and a collapsed parent gives a zero-height frame
      // that never paints.
      className="h-[1600px] w-full border-2 border-ink bg-paper"
    />
  );
}
