import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { enqueueProfileSync } from "@/lib/profile-sync";

const Input = z.object({ userId: z.string().uuid(), event: z.literal("quest_completed").optional(), questId: z.string().optional() });
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const expected = process.env.PROFILE_SYNC_WEBHOOK_SECRET;
    if (expected && request.headers.get("x-campusquest-sync-secret") !== expected) throw new Error("FORBIDDEN");
    const input = Input.parse(await request.json());
    return Response.json(await enqueueProfileSync(input.userId, input.event ?? "profile_updated"));
  } catch (error) { return errorResponse(error, "Could not schedule Databricks profile sync"); }
}
