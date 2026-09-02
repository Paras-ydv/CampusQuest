import type { Metadata } from "next";
import { AtsView } from "@/components/app/ats-view";
import { getAtsState } from "@/lib/backend/ats";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "ATS score" };
export const dynamic = "force-dynamic";

export default async function AtsPage() {
  // Read through the backend module rather than fetching our own route: this
  // is a server component, and the state is only whether a résumé and score
  // exist. Scoring itself stays a POST the student triggers.
  const user = await requireUser();
  return <AtsView initial={await getAtsState(undefined, user.id)} />;
}
