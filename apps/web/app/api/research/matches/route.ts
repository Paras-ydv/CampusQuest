import { ResearchMatch } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getBackendProfile } from "@/lib/backend/profile";
import { researchMatches } from "@/lib/research-repository";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const profile = await getBackendProfile(request, user.id);
    return Response.json(ResearchMatch.array().parse(await researchMatches(profile)));
  } catch (error) { return errorResponse(error, "Could not load research matches"); }
}
