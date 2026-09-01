import { OnboardingInput, Profile } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { applyOnboarding } from "@/lib/backend/profile";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = OnboardingInput.parse(await request.json());
    return Response.json(Profile.parse(await applyOnboarding(request, user.id, input)));
  } catch (error) {
    return errorResponse(error, "Could not complete onboarding");
  }
}
