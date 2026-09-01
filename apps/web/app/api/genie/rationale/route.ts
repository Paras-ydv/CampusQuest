import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { genieNarrative } from "@/lib/genie";
import { recommendationRationale } from "@/lib/rationale";

const RationaleInput = z.union([
  z.object({ prompt: z.string().min(1).max(4_000) }),
  /**
   * A single recommendation card asking "why is this for me?".
   *
   * The facts are the ones the server already computed for that card and sent
   * to the client, so nothing new is asserted here. Genie is asked to phrase
   * them, never to add to them — every number in the answer must be a number
   * that was already on the card.
   */
  z.object({
    kind: z.enum(["quest", "person", "opportunity", "research"]),
    title: z.string().min(1).max(200),
    facts: z.array(z.string().min(1).max(400)).min(1).max(8),
  }),
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
    if ("kind" in input) {
      return Response.json({
        rationale: await recommendationRationale({
          studentId: user.id, kind: input.kind, title: input.title, facts: input.facts,
        }),
      });
    }
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
