import { createHash } from "node:crypto";
import { createAdminSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

export const EMBEDDING_DIMENSIONS = 1024;
export type Embedding = number[];

export type EmbeddingProfileInput = {
  userId: string;
  goalRole: string;
  interests: string[];
  skills: { id: string; name: string }[];
  projects: { title: string; summary: string }[];
  collaborationIntent?: string | null;
};

export function canonicalizeProfile(input: EmbeddingProfileInput): string {
  return [
    `Goal: ${input.goalRole.trim()}`,
    `Interests: ${[...input.interests].map((x) => x.trim()).filter(Boolean).sort().join(", ")}`,
    `Skills: ${[...input.skills].map((x) => x.name || x.id).filter(Boolean).sort().join(", ")}`,
    `Projects: ${[...input.projects].map((x) => `${x.title.trim()}: ${x.summary.trim()}`).filter(Boolean).sort().join(" | ")}`,
    `Collaboration: ${(input.collaborationIntent ?? "").trim()}`,
  ].join("\n").toLowerCase();
}

export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** Stable, non-semantic test/development embedding. It is never enabled in production. */
export function deterministicEmbedding(text: string): Embedding {
  const values = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const bytes = createHash("sha512").update(text).digest();
  for (let i = 0; i < text.length; i += 1) {
    const position = (text.charCodeAt(i) * 31 + i * 131 + bytes[i % bytes.length]!) % EMBEDDING_DIMENSIONS;
    values[position] = (values[position] ?? 0) + ((bytes[(i * 7) % bytes.length]! / 255) * 2 - 1);
  }
  const norm = Math.sqrt(values.reduce((sum, value) => sum + value * value, 0)) || 1;
  return values.map((value) => value / norm);
}

export function validateEmbedding(value: unknown): Embedding {
  const candidate = Array.isArray(value) ? value : undefined;
  if (!candidate || candidate.length !== EMBEDDING_DIMENSIONS || candidate.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    throw new Error(`Embedding provider returned an invalid ${EMBEDDING_DIMENSIONS}-dimension vector`);
  }
  return candidate;
}

function providerModel(): string {
  return process.env.EMBEDDING_MODEL ?? process.env.DATABRICKS_EMBEDDING_ENDPOINT ?? "local-deterministic-v1";
}

async function databricksEmbedding(text: string): Promise<Embedding> {
  const host = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
  const token = process.env.DATABRICKS_TOKEN;
  const endpoint = process.env.DATABRICKS_EMBEDDING_ENDPOINT;
  if (!host || !token || !endpoint) {
    if (localFallbackEnabled()) return deterministicEmbedding(text);
    throw new Error("Databricks embedding configuration is required in production");
  }
  const response = await fetch(`${host}/serving-endpoints/${encodeURIComponent(endpoint)}/invocations`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ input: [text] }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Databricks embedding request failed (${response.status})`);
  const payload: unknown = await response.json();
  const record = payload as { data?: { embedding?: unknown }[]; predictions?: unknown[]; embedding?: unknown };
  const vector = record.data?.[0]?.embedding ?? record.predictions?.[0] ?? record.embedding;
  return validateEmbedding(vector);
}

export function vectorLiteral(vector: Embedding): string {
  return `[${vector.join(",")}]`;
}

/** Uses the content hash as a cache key before calling the provider. */
export async function getOrCreateProfileEmbedding(input: EmbeddingProfileInput): Promise<{ embedding: Embedding; canonicalText: string; hash: string; model: string }> {
  const canonicalText = canonicalizeProfile(input);
  const hash = contentHash(canonicalText);
  const model = providerModel();
  const admin = createAdminSupabaseClient();
  if (admin) {
    const { data, error } = await admin
      .from("embeddings")
      .select("embedding")
      .eq("entity_type", "profile")
      .eq("entity_id", input.userId)
      .eq("model", model)
      .eq("content_hash", hash)
      .maybeSingle();
    if (error) throw new Error(`Could not read embedding cache: ${error.message}`);
    if (data?.embedding) return { embedding: validateEmbedding(parseStoredVector(data.embedding)), canonicalText, hash, model };
  }
  const embedding = await databricksEmbedding(canonicalText);
  if (admin) {
    const { error } = await admin.from("embeddings").upsert({
      user_id: input.userId,
      entity_type: "profile",
      entity_id: input.userId,
      model,
      canonical_text: canonicalText,
      content_hash: hash,
      embedding: vectorLiteral(embedding),
    } as never, { onConflict: "entity_type,entity_id,model,content_hash" });
    if (error) throw new Error(`Could not cache embedding: ${error.message}`);
  }
  return { embedding, canonicalText, hash, model };
}

function parseStoredVector(value: unknown): unknown {
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try { return JSON.parse(value.replace(/^\[/, "[").replace(/\]$/, "]")); } catch { return value.slice(1, -1).split(",").map(Number); }
  }
  return value;
}
