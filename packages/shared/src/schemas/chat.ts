import { z } from "zod";
import { Id, IsoDate, paginated } from "./common";

export const Thread = z.object({
  id: Id,
  kind: z.enum(["direct", "group"]).default("direct"),
  createdAt: IsoDate,
  updatedAt: IsoDate,
  memberIds: z.array(Id).min(1),
});
export type Thread = z.infer<typeof Thread>;

export const ChatMessage = z.object({
  id: Id,
  threadId: Id,
  senderId: Id,
  body: z.string().min(1).max(4_000),
  createdAt: IsoDate,
  editedAt: IsoDate.nullable().default(null),
});
export type ChatMessage = z.infer<typeof ChatMessage>;

export const CreateThreadInput = z.object({
  /** Direct messages require exactly one other member. */
  memberIds: z.array(Id).min(1).max(20),
  kind: z.enum(["direct", "group"]).default("direct"),
});
export type CreateThreadInput = z.infer<typeof CreateThreadInput>;

export const SendMessageInput = z.object({
  body: z.string().trim().min(1).max(4_000),
});
export type SendMessageInput = z.infer<typeof SendMessageInput>;

export const MessagePage = paginated(ChatMessage);
export type MessagePage = z.infer<typeof MessagePage>;
