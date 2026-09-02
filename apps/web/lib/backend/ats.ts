/**
 * Stored résumé text and its ATS evaluation.
 *
 * Both live one-row-per-student. Onboarding writes the text when a résumé is
 * uploaded; the ATS screen reads it so a student who arrived that way is never
 * asked for the same document twice.
 */
import type { AtsScore, AtsState } from "@campusquest/shared";
import { evaluateResume } from "@/lib/resume/ats-evaluator";
import { localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";

/** Mirrors the column's own bound so an oversized résumé fails here, legibly. */
const MAX_CONTENT = 200_000;

export async function saveResumeText(
  request: Request | undefined,
  userId: string,
  content: string,
  fileName: string | null,
): Promise<void> {
  const trimmed = content.trim().slice(0, MAX_CONTENT);
  if (!trimmed) return;

  const supabase = await supabaseForCaller(request);
  // In local-fallback mode there is nowhere to persist, and onboarding must
  // still succeed — the ATS screen simply asks for an upload instead.
  if (!supabase) return;

  const { error } = await supabase
    .from("user_resumes")
    .upsert({ user_id: userId, content: trimmed, file_name: fileName }, { onConflict: "user_id" });
  // A résumé that could not be stored must not fail the onboarding it came
  // from: the student's profile is the thing that matters, and re-uploading on
  // the ATS screen recovers this entirely.
  if (error) console.warn("[ats] could not store résumé text —", error.message);
}

/** The stored résumé, or null when the student has never uploaded one. */
export async function getResumeText(
  request: Request | undefined,
  userId: string,
): Promise<{ content: string; fileName: string | null; updatedAt: string } | null> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("user_resumes")
    .select("content, file_name, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { content: data.content, fileName: data.file_name, updatedAt: data.updated_at };
}

/**
 * The ATS screen's initial state: whether a résumé is stored, and the last
 * score if one has been computed.
 *
 * A score is marked stale rather than hidden when the résumé has changed since
 * it was computed — the student should see what their previous document scored
 * while being told it is out of date.
 */
export async function getAtsState(request: Request | undefined, userId: string): Promise<AtsState> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (localFallbackEnabled()) return { hasResume: false, fileName: null, score: null };
    throw new Error("SUPABASE_NOT_CONFIGURED");
  }

  const [resume, { data: scoreRow }] = await Promise.all([
    getResumeText(request, userId),
    supabase.from("user_ats_scores").select("overall, detail, scored_at").eq("user_id", userId).maybeSingle(),
  ]);

  if (!scoreRow) {
    return { hasResume: Boolean(resume), fileName: resume?.fileName ?? null, score: null };
  }

  const detail = scoreRow.detail as Omit<AtsScore, "overall" | "scoredAt" | "stale" | "fileName">;
  return {
    hasResume: Boolean(resume),
    fileName: resume?.fileName ?? null,
    score: {
      ...detail,
      overall: scoreRow.overall,
      fileName: resume?.fileName ?? null,
      scoredAt: scoreRow.scored_at,
      stale: Boolean(resume && new Date(resume.updatedAt) > new Date(scoreRow.scored_at)),
    },
  };
}

/**
 * Scores the stored résumé and records the result.
 *
 * Throws NOT_FOUND when nothing is stored, so the route can tell the screen to
 * ask for an upload rather than reporting a failure.
 */
export async function scoreStoredResume(request: Request | undefined, userId: string): Promise<AtsScore> {
  const resume = await getResumeText(request, userId);
  if (!resume) throw new Error("NOT_FOUND");

  const evaluation = await evaluateResume(resume.content);
  // Databricks unreachable, slow, or answering unusably. Saying so is better
  // than storing a fabricated score the student would act on.
  if (!evaluation) throw new Error("Résumé scoring is unavailable right now. Try again in a moment.");

  const scoredAt = new Date().toISOString();
  const supabase = await supabaseForCaller(request);
  if (supabase) {
    const { overall, ...detail } = evaluation;
    const { error } = await supabase
      .from("user_ats_scores")
      .upsert({ user_id: userId, overall, detail, scored_at: scoredAt }, { onConflict: "user_id" });
    if (error) console.warn("[ats] could not store score —", error.message);
  }

  return { ...evaluation, fileName: resume.fileName, scoredAt, stale: false };
}
