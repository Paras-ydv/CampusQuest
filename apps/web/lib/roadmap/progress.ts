import {
  RoadmapWithProgress,
  TopicProgress,
  type RoadmapOutline,
  type SetTopicProgressInput,
  type TopicProgressStatus,
} from "@campusquest/shared";
import { createRequestSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";
import { leafNodeIds, loadOutline } from "./outlines";

/**
 * ===========================================================================
 *  TOPIC PROGRESS
 * ===========================================================================
 * Per-student, per-topic ticks, persisted under RLS.
 *
 * This is a self-report and is treated as one everywhere: it drives the
 * completion figure on the roadmap panel and nothing else. Promoting a skill to
 * `user_skills.source = 'verified'` stays the quest engine's job, because a
 * checkbox is not evidence that anything was learned.
 */

/** Mock-mode store. Per-process and deliberately not persisted. */
const fallback = new Map<string, Map<string, TopicProgressStatus>>();

function fallbackKey(userId: string, slug: string): string {
  return `${userId}:${slug}`;
}

/** Null when the progress table does not exist yet — see the PGRST205 note below. */
export async function listProgress(
  request: Request | undefined,
  userId: string,
  slug: string,
): Promise<TopicProgress[] | null> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const store = fallback.get(fallbackKey(userId, slug)) ?? new Map();
    return [...store.entries()].map(([nodeId, status]) => ({ slug, nodeId, status }));
  }

  const { data, error } = await supabase
    .from("user_topic_progress")
    .select("node_id, status")
    .eq("user_id", userId)
    .eq("roadmap_slug", slug);

  /*
   * PGRST205 means the table is not in the schema cache — the roadmap
   * migration has not been applied to this database. That is a deployment
   * state, not a broken request, so the outline is still worth showing. It is
   * reported as "no progress store" rather than "no progress", because the two
   * must not look the same to the student: one means nothing is ticked, the
   * other means ticking will not stick.
   *
   * Every other error still throws.
   */
  if (error?.code === "PGRST205") return null;
  if (error) throw new Error(`Could not load roadmap progress: ${error.message}`);

  return (data ?? []).map((row) =>
    TopicProgress.parse({ slug, nodeId: row.node_id, status: row.status }),
  );
}

/**
 * Sets or clears one tick.
 *
 * `unseen` is the absence of a row rather than a stored value, so un-ticking
 * deletes. Keeping a row that says "not started" would make the table grow with
 * every topic a student merely looked at.
 */
export async function setProgress(
  request: Request | undefined,
  userId: string,
  input: SetTopicProgressInput,
): Promise<TopicProgress> {
  const outline = await loadOutline(input.slug);
  if (!outline) throw new Error("NOT_FOUND");
  // Only nodes this outline actually contains — otherwise the table accepts
  // arbitrary strings and the completion figure stops meaning anything.
  const known = new Set([...leafNodeIds(outline), ...outline.topics.map((t) => t.nodeId)]);
  if (!known.has(input.nodeId)) throw new Error("NOT_FOUND");

  const supabase = createRequestSupabaseClient(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const key = fallbackKey(userId, input.slug);
    const store = fallback.get(key) ?? new Map<string, TopicProgressStatus>();
    if (input.status === "unseen") store.delete(input.nodeId);
    else store.set(input.nodeId, input.status);
    fallback.set(key, store);
    return { slug: input.slug, nodeId: input.nodeId, status: input.status };
  }

  if (input.status === "unseen") {
    const { error } = await supabase
      .from("user_topic_progress")
      .delete()
      .eq("user_id", userId)
      .eq("roadmap_slug", input.slug)
      .eq("node_id", input.nodeId);
    if (error) throw new Error(`Could not clear roadmap progress: ${error.message}`);
  } else {
    const { error } = await supabase.from("user_topic_progress").upsert(
      {
        user_id: userId,
        roadmap_slug: input.slug,
        node_id: input.nodeId,
        status: input.status,
      },
      { onConflict: "user_id,roadmap_slug,node_id" },
    );
    if (error) throw new Error(`Could not save roadmap progress: ${error.message}`);
  }

  return { slug: input.slug, nodeId: input.nodeId, status: input.status };
}

/** Share of leaf subtopics marked done. Headings are excluded — they are not work. */
export function completionPct(outline: RoadmapOutline, progress: TopicProgress[]): number {
  const leaves = leafNodeIds(outline);
  if (!leaves.length) return 0;
  const done = new Set(progress.filter((p) => p.status === "done").map((p) => p.nodeId));
  const hit = leaves.filter((id) => done.has(id)).length;
  return Math.round((100 * hit) / leaves.length);
}

export async function roadmapWithProgress(
  request: Request | undefined,
  userId: string,
  outline: RoadmapOutline,
): Promise<RoadmapWithProgress> {
  const stored = await listProgress(request, userId, outline.slug);
  const progress = stored ?? [];
  return RoadmapWithProgress.parse({
    outline,
    progress,
    completedPct: completionPct(outline, progress),
    progressAvailable: stored !== null,
  });
}
