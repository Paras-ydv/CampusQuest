import { Opportunity, OpportunityKind, OpportunityQuery, ToggleSavedInput } from "@campusquest/shared";
import { errorResponse, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { opportunityRadar, setOpportunitySaved } from "@/lib/opportunity-radar";

export const dynamic = "force-dynamic";

/** Query-string params arrive as strings; the schema wants typed values. */
function toQuery(raw: Record<string, string>): OpportunityQuery {
  return OpportunityQuery.parse({
    kinds: raw.kinds ? raw.kinds.split(",").filter((kind) => OpportunityKind.safeParse(kind).success) : undefined,
    difficulty: raw.difficulty || undefined,
    closingWithinDays: raw.closingWithinDays ? Number(raw.closingWithinDays) : undefined,
    savedOnly: raw.savedOnly === "true" ? true : undefined,
    search: raw.search || undefined,
  });
}

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const items = await opportunityRadar(request, user.id, toQuery(parseQuery(request)));
    return Response.json(Opportunity.array().parse(items));
  } catch (error) {
    return errorResponse(error, "Could not load opportunities");
  }
}

/** Save or unsave. Persisted per-user in Supabase under RLS. */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = ToggleSavedInput.parse(await request.json());
    return Response.json(await setOpportunitySaved(request, user.id, input.opportunityId, input.saved));
  } catch (error) {
    return errorResponse(error, "Could not update saved opportunity");
  }
}
