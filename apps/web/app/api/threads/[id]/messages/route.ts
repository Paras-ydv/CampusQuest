import { MessagePage, SendMessageInput, ChatMessage } from "@campusquest/shared";
import { z } from "zod";
import { errorResponse, parseQuery } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { listMessages, sendMessage } from "@/lib/chat";

const PageQuery = z.object({ cursor: z.string().nullable().optional(), limit: z.coerce.number().int().min(1).max(100).default(30) });
export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(request); const { id } = await context.params; const query = PageQuery.parse(parseQuery(request)); return Response.json(MessagePage.parse(await listMessages(request, user.id, id, query.cursor ?? null, query.limit))); }
  catch (error) { return errorResponse(error, "Could not load messages"); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const user = await requireUser(request); const { id } = await context.params; return Response.json(ChatMessage.parse(await sendMessage(request, user.id, id, SendMessageInput.parse(await request.json()).body)), { status: 201 }); }
  catch (error) { return errorResponse(error, "Could not send message"); }
}
