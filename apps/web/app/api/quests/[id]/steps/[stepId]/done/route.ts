import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { setQuestStepDone } from "@/lib/quest-engine";

/**
 * Marks a step done, or clears it, without GitHub proof.
 *
 * Separate from `/verify` on purpose: that route asks the verifier whether the
 * work is really there, this one records the student's own word for it. The
 * two are stored in different columns and shown differently, so a self-report
 * can never be mistaken for a verification.
 */
export async function POST(request: Request, context: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const user = await requireUser(request);
    const { id, stepId } = await context.params;
    await setQuestStepDone(request, user.id, id, stepId, true);
    return Response.json({ questId: id, stepId, done: true });
  } catch (error) {
    return errorResponse(error, "Could not update that task");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string; stepId: string }> }) {
  try {
    const user = await requireUser(request);
    const { id, stepId } = await context.params;
    await setQuestStepDone(request, user.id, id, stepId, false);
    return Response.json({ questId: id, stepId, done: false });
  } catch (error) {
    return errorResponse(error, "Could not update that task");
  }
}
