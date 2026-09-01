import { z } from "zod";
import { Id, IsoDate } from "./common";

export const GenieRole = z.enum(["user", "assistant"]);
export type GenieRole = z.infer<typeof GenieRole>;

/** Mirrors the Databricks Genie message lifecycle. */
export const GenieStatus = z.enum([
  "pending",
  "interpreting",
  "executing",
  "complete",
  "failed",
]);
export type GenieStatus = z.infer<typeof GenieStatus>;

/** A result set Genie returned alongside its prose answer. */
export const GenieResultTable = z.object({
  columns: z.array(z.string()),
  rows: z.array(z.array(z.union([z.string(), z.number(), z.null()]))),
  truncated: z.boolean().default(false),
});
export type GenieResultTable = z.infer<typeof GenieResultTable>;

export const GenieMessage = z.object({
  id: Id,
  role: GenieRole,
  text: z.string(),
  status: GenieStatus.default("complete"),
  table: GenieResultTable.nullable().default(null),
  /** The SQL Genie generated. Shown so answers stay auditable. */
  sql: z.string().nullable().default(null),
  createdAt: IsoDate,
});
export type GenieMessage = z.infer<typeof GenieMessage>;

export const GenieConversation = z.object({
  id: Id,
  title: z.string(),
  messages: z.array(GenieMessage),
  createdAt: IsoDate,
});
export type GenieConversation = z.infer<typeof GenieConversation>;

export const GenieAskInput = z.object({
  question: z.string().min(1).max(1000),
  /** Omit to start a new conversation. */
  conversationId: Id.optional(),
});
export type GenieAskInput = z.infer<typeof GenieAskInput>;

/**
 * Server-sent event frames for `POST /api/genie/ask`.
 * P1 renders these; P2 emits them.
 */
export const GenieStreamEvent = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: GenieStatus }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("table"), table: GenieResultTable }),
  z.object({ type: z.literal("sql"), sql: z.string() }),
  z.object({
    type: z.literal("done"),
    conversationId: Id,
    messageId: Id,
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
]);
export type GenieStreamEvent = z.infer<typeof GenieStreamEvent>;

/** Prompts offered in the UI before the student writes their own. */
export const GenieSuggestion = z.object({
  id: Id,
  label: z.string(),
  question: z.string(),
});
export type GenieSuggestion = z.infer<typeof GenieSuggestion>;
