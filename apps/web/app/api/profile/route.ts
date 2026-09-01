import { Profile, UpdateProfileInput } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { getFullProfile, updateProfile } from "@/lib/backend/profile";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(Profile.parse(await getFullProfile(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not load profile");
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser(request);
    const input = UpdateProfileInput.parse(await request.json());
    return Response.json(Profile.parse(await updateProfile(request, user.id, input)));
  } catch (error) {
    return errorResponse(error, "Could not update profile");
  }
}
