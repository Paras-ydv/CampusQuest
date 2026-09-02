import { VerifyQuestStepInput, VerifyQuestStepResult } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { verifyQuestStep } from "@/lib/quest-engine";
export async function POST(request: Request, context: { params: Promise<{ id: string; stepId: string }> }) { try { const user=await requireUser(request); const {id,stepId}=await context.params; const input=VerifyQuestStepInput.parse(await request.json()); return Response.json(VerifyQuestStepResult.parse(await verifyQuestStep(request,user.id,id,stepId,input.repositoryUrl))); } catch(error) { return errorResponse(error,"Could not verify quest task"); } }
