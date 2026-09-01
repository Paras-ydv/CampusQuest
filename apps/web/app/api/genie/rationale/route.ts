import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { genieNarrative } from "@/lib/genie";
import { recommendationRationale } from "@/lib/rationale";

const RationaleInput = z.union([
  z.object({ prompt: z.string().min(1).max(4_000) }),
  z.object({
    userId: z.string().uuid().optional(),
    candidates: z.array(z.object({
      id: z.string().min(1), name: z.string().min(1),
      complementarySkills: z.array(z.string()).max(20),
      sharedInterests: z.array(z.string()).max(20),
    })).min(1).max(100),
  }),
]);
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = RationaleInput.parse(await request.json());
    if ("prompt" in input) return Response.json({ rationale: await genieNarrative(user.id, input.prompt) });
    const matches = await Promise.all(input.candidates.map(async (candidate, rank) => ({
      id: candidate.id,
      rank,
      why: await recommendationRationale({
        studentId: user.id,
        kind: "person",
        title: candidate.name,
        facts: [
          `Complementary skills: ${candidate.complementarySkills.join(", ") || "none supplied"}.`,
          `Shared interests: ${candidate.sharedInterests.join(", ") || "none supplied"}.`,
        ],
      }),
    })));
    return Response.json({ matches });
  } catch (error) { return errorResponse(error, "Could not create recommendation rationale"); }
}
