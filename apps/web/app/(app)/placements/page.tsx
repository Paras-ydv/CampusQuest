import type { Metadata } from "next";
import { PlacementDashboard } from "@/components/app/placement-dashboard";
import { Label } from "@/components/ui/primitives";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { dashboardEmbedConfig, dashboardEmbedConfigured } from "@/lib/databricks/dashboard-embed";

export const metadata: Metadata = { title: "Placements" };

export default function PlacementsPage() {
  const config = dashboardEmbedConfigured() ? dashboardEmbedConfig() : null;

  return (
    <div className="mx-auto max-w-[1400px]">
      <section className="border-b-2 border-ink px-5 py-12">
        <Label className="mb-4">Placement insights</Label>
        <WordRise
          as="h1"
          text="Five years of hiring, on the record."
          className="k-display max-w-[16ch] text-[clamp(2.2rem,7vw,5rem)]"
        />
        <Reveal index={5} className="mt-6 max-w-[56ch]">
          <p className="text-[0.98rem] leading-relaxed text-muted">
            Who recruited on campus, who keeps coming back, what they paid, and
            which skills the students who got offers were carrying. Every figure
            is a query over the campus dataset — history, not a forecast.
          </p>
        </Reveal>
      </section>

      <section className="px-5 py-8">
        {config ? (
          <PlacementDashboard config={config} />
        ) : (
          <div className="border-2 border-ink bg-sunk px-5 py-8">
            <p className="font-mono text-[0.6875rem] tracking-[0.12em] text-hot uppercase">
              Not configured
            </p>
            <p className="mt-3 max-w-[60ch] text-[0.95rem] leading-relaxed text-muted">
              Set DATABRICKS_WORKSPACE_ID, DATABRICKS_DASHBOARD_ID,
              DATABRICKS_DASHBOARD_CLIENT_ID and DATABRICKS_DASHBOARD_CLIENT_SECRET,
              then deploy the dashboard with{" "}
              <code className="font-mono text-ink">
                node scripts/deploy-placement-dashboard.mjs
              </code>
              .
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
