import { CreateThreadInput, Thread } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { createThread, listThreads } from "@/lib/chat";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const user = await requireUser(request); return Response.json(Thread.array().parse(await listThreads(request, user.id))); }
  catch (error) { return errorResponse(error, "Could not load threads"); }
}
export async function POST(request: Request) {
  try { const user = await requireUser(request); return Response.json(Thread.parse(await createThread(request, user.id, CreateThreadInput.parse(await request.json()))), { status: 201 }); }
  catch (error) { return errorResponse(error, "Could not create thread"); }
}
