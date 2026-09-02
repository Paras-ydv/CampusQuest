/**
 * Shared transport for the Databricks chat endpoints used during résumé
 * extraction.
 *
 * Both callers — resolving phrasings onto catalogue ids, and deciding whether
 * a candidate skill duplicates an existing one — need the same things: a
 * reasoning model, a bounded wait, a reply flattened out of whatever shape the
 * endpoint returns, and a failure that is silent rather than fatal.
 */

/**
 * A reasoning model is required, not a general instruct model. Asked which
 * catalogue skills a résumé supports, llama-3.3-70b echoes the catalogue back
 * with its own names as "evidence"; gpt-oss-120b works through the candidates
 * and rejects what the document does not support. Override with
 * DATABRICKS_SKILL_ENDPOINT.
 */
const DEFAULT_ENDPOINT = "databricks-gpt-oss-120b";

/** Bounded so a slow endpoint cannot hold up onboarding. */
const TIMEOUT_MS = 20_000;

export function chatEndpoint(): string {
  return process.env.DATABRICKS_SKILL_ENDPOINT ?? DEFAULT_ENDPOINT;
}

export function databricksConfigured(): boolean {
  return Boolean(process.env.DATABRICKS_HOST && process.env.DATABRICKS_TOKEN);
}

/**
 * Sends one chat completion. Returns null on any failure — missing
 * credentials, non-200, timeout, malformed body — so every caller degrades to
 * its deterministic behaviour instead of failing the request.
 *
 * `temperature` and `timeoutMs` default to the résumé settings this started
 * as. The roadmap assessment overrides both: it wants a different set of
 * questions on a retake rather than the same one, and it is a deliberate wait
 * a student is watching, not a step inside onboarding.
 */
export async function databricksChat({
  endpoint,
  system,
  user,
  maxTokens = 2000,
  temperature = 0,
  timeoutMs = TIMEOUT_MS,
}: {
  endpoint: string;
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}): Promise<string | null> {
  const host = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  if (!host || !token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${host}/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        // Deterministic by default, so the same résumé yields the same profile twice.
        temperature,
        // A reasoning model spends most of its budget before the answer; too
        // small a cap truncates the JSON and yields nothing.
        max_tokens: maxTokens,
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
    return messageText(payload.choices?.[0]?.message?.content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Flattens an assistant message into text.
 *
 * A plain chat model returns a string. A reasoning model returns an array of
 * parts — its working, then the answer — so the parts are joined and the
 * final JSON array is picked out downstream.
 */
export function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      const record = part as { text?: unknown; summary?: { text?: unknown }[] };
      if (typeof record.text === "string") return record.text;
      return (record.summary ?? []).map((entry) => (typeof entry.text === "string" ? entry.text : "")).join("");
    })
    .join("\n");
}

/**
 * Extracts the JSON array a reply ends with.
 *
 * A reasoning model's working may contain several bracketed fragments; the
 * answer is the last one that parses, so candidates are tried from the end.
 */
export function jsonFromReply(reply: string): unknown {
  const fragments = reply.match(/\[[\s\S]*?\]/g) ?? [];
  for (let i = fragments.length - 1; i >= 0; i -= 1) {
    try {
      const candidate: unknown = JSON.parse(fragments[i]!);
      if (Array.isArray(candidate)) return candidate;
    } catch {
      // Not JSON — keep looking backwards.
    }
  }
  return null;
}
