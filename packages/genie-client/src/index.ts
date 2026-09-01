export type GenieResultTable = {
  columns: string[];
  rows: (string | number | null)[][];
  truncated: boolean;
};

export type GenieResponse = {
  conversationId: string;
  messageId: string;
  status: "pending" | "interpreting" | "executing" | "complete" | "failed";
  text: string;
  sql: string | null;
  table: GenieResultTable | null;
  raw: unknown;
};

type FetchLike = typeof fetch;
type RawRecord = Record<string, unknown>;

export type GenieClientOptions = {
  host: string;
  token: string;
  spaceId: string;
  fetch?: FetchLike;
  pollIntervalMs?: number;
  timeoutMs?: number;
};

function record(value: unknown): RawRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as RawRecord
    : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.length ? value : null;
}

function statusFrom(value: unknown): GenieResponse["status"] {
  switch (value) {
    case "COMPLETED": return "complete";
    case "FAILED":
    case "CANCELLED": return "failed";
    case "EXECUTING_QUERY":
    case "PENDING_WAREHOUSE": return "executing";
    default: return "interpreting";
  }
}

function tableFrom(value: unknown): GenieResultTable | null {
  const outer = record(value);
  // The attachment query-result endpoint wraps its payload in
  // `statement_response`; an inline attachment is already unwrapped.
  const response = record(outer.statement_response ?? outer);
  // `manifest` and `result` are siblings: the column schema lives in the
  // manifest, the rows in the result. Reading the manifest out of `result`
  // yields a table with rows and no columns.
  const result = record(response.result);
  const manifest = record(response.manifest ?? result.manifest);
  const schema = record(manifest.schema);
  const columns = Array.isArray(schema.columns)
    ? schema.columns.map((column) => text(record(column).name) ?? "value")
    : [];
  const rawRows = Array.isArray(result.data_array) ? result.data_array : [];
  if (!columns.length && !rawRows.length) return null;
  return {
    columns,
    rows: rawRows.map((row) => Array.isArray(row)
      ? row.map((cell) => typeof cell === "string" || typeof cell === "number" || cell === null ? cell : String(cell))
      : []),
    truncated: Boolean(manifest.truncated ?? result.truncated),
  };
}

function extract(message: unknown, conversationId: string, messageId: string): GenieResponse {
  const raw = record(message);
  const attachments = Array.isArray(raw.attachments) ? raw.attachments.map(record) : [];
  const textAttachment = attachments.find((attachment) => text(record(attachment.text).content));
  const queryAttachment = attachments.find((attachment) => {
    const item = record(attachment.query);
    return text(item.query) || text(item.sql) || text(item.statement);
  });
  const responseText = text(record(textAttachment?.text).content) ?? text(raw.content) ?? "";
  const query = record(queryAttachment?.query);
  return {
    conversationId,
    messageId,
    status: statusFrom(raw.status),
    text: responseText,
    sql: text(query.query) ?? text(query.sql) ?? text(query.statement),
    table: tableFrom(query.statement_response ?? query.query_result),
    raw: message,
  };
}

/** Thin, server-only wrapper for Databricks Genie Conversation APIs. */
export class GenieClient {
  private readonly host: string;
  private readonly token: string;
  private readonly spaceId: string;
  private readonly request: FetchLike;
  private readonly pollIntervalMs: number;
  private readonly timeoutMs: number;

  constructor(options: GenieClientOptions) {
    this.host = options.host.replace(/\/$/, "");
    this.token = options.token;
    this.spaceId = options.spaceId;
    this.request = options.fetch ?? fetch;
    this.pollIntervalMs = options.pollIntervalMs ?? 750;
    this.timeoutMs = options.timeoutMs ?? 120_000;
  }

  private path(path: string): string { return `${this.host}/api/2.0/genie/spaces/${encodeURIComponent(this.spaceId)}${path}`; }

  private async call(path: string, init?: RequestInit): Promise<RawRecord> {
    const response = await this.request(this.path(path), {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json", ...init?.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Databricks Genie request failed (${response.status}): ${text(record(body).message) ?? "unknown error"}`);
    return record(body);
  }

  async startConversation(content: string): Promise<{ conversationId: string; messageId: string }> {
    const body = await this.call("/start-conversation", { method: "POST", body: JSON.stringify({ content, enable_visualization: false }) });
    const conversationId = text(body.conversation_id);
    const messageId = text(body.message_id) ?? text(record(body.message).message_id) ?? text(record(body.message).id);
    if (!conversationId || !messageId) throw new Error("Databricks Genie returned no conversation or message identifier");
    return { conversationId, messageId };
  }

  async createMessage(conversationId: string, content: string): Promise<{ messageId: string }> {
    const body = await this.call(`/conversations/${encodeURIComponent(conversationId)}/messages`, { method: "POST", body: JSON.stringify({ content }) });
    const messageId = text(body.message_id) ?? text(body.id) ?? text(record(body.message).message_id);
    if (!messageId) throw new Error("Databricks Genie returned no message identifier");
    return { messageId };
  }

  async getMessage(conversationId: string, messageId: string): Promise<GenieResponse> {
    const body = await this.call(`/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}`);
    const response = extract(body, conversationId, messageId);
    const attachments = record(body).attachments;
    const attachment = Array.isArray(attachments)
      ? attachments.map(record).find((item) => text(item.attachment_id) && item.query)
      : undefined;
    const attachmentId = text(record(attachment).attachment_id);
    // Not gated on `complete`: the query result is usually available while
    // Genie is still composing its answer, and surfacing the table early is
    // most of the perceived speed-up. A miss here is cheap — the call simply
    // fails and we try again on the next poll.
    if (attachmentId && !response.table) {
      try {
        const result = await this.call(`/conversations/${encodeURIComponent(conversationId)}/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}/query-result`);
        response.table = tableFrom(result);
      } catch { /* Text answers remain useful when an attachment has expired. */ }
    }
    return response;
  }

  async waitForCompletion(conversationId: string, messageId: string, onPoll?: (response: GenieResponse) => void): Promise<GenieResponse> {
    const deadline = Date.now() + this.timeoutMs;
    let attempt = 0;
    while (Date.now() < deadline) {
      const response = await this.getMessage(conversationId, messageId);
      onPoll?.(response);
      if (response.status === "complete") return response;
      if (response.status === "failed") throw new Error("Databricks Genie could not complete the message");
      // Tight early, looser later. The transitions worth catching promptly —
      // the SQL appearing, the warehouse finishing — happen in the first few
      // seconds; after that a slower cadence costs nothing and spares the API.
      const interval = attempt < 8 ? Math.max(300, this.pollIntervalMs / 2) : this.pollIntervalMs;
      attempt += 1;
      await new Promise((resolve) => setTimeout(resolve, interval));
    }
    throw new Error("Databricks Genie polling timed out");
  }
}
