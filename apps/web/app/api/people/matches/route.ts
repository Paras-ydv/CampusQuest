import { PeerMatch, PeopleQuery } from "@campusquest/shared";
import { errorResponse, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { peopleMatches } from "@/lib/people-matchmaker";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const raw = parseQuery(request);
    const query = PeopleQuery.parse({ ...raw, lookingForTeam: raw.lookingForTeam === undefined ? undefined : raw.lookingForTeam === "true" });
    const user = await requireUser(request);
    return Response.json(PeerMatch.array().parse(await peopleMatches(request, user.id, query)));
  } catch (error) { return errorResponse(error, "Could not load people matches"); }
}
