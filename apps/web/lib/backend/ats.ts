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
  /**
   * When true a storage failure throws instead of warning. The ATS upload sets
   * it, because there the stored résumé *is* the deliverable: a silent failure
   * left the screen reporting success and then showing nothing. Onboarding
   * leaves it false — the profile is what matters there, and the ATS screen
   * can always ask for the file again.
   */
  required = false,
): Promise<void> {
  const trimmed = content.trim().slice(0, MAX_CONTENT);
  if (!trimmed) {
    if (required) throw new Error("We couldn't read any text from that PDF.");
    return;
  }

  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    // In local-fallback mode there is nowhere to persist. Onboarding continues
    // regardless; an ATS upload has to say so rather than appear to work.
    if (required) throw new Error("Résumé storage is not configured.");
    return;
  }

  const { error } = await supabase
    .from("user_resumes")
    .upsert({ user_id: userId, content: trimmed, file_name: fileName }, { onConflict: "user_id" });
  if (error) {
    console.warn("[ats] could not store résumé text —", error.message);
    if (required) throw new Error(`Could not save your résumé: ${error.message}`);
  }
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
