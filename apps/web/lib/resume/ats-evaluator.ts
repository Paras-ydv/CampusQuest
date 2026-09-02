/**
 * ATS résumé evaluation, on HackerRank's own rubric.
 *
 * The weights, category ceilings, bonus cap and deduction rules are taken from
 * `interviewstreet/hiring-agent` — the evaluator HackerRank runs over its
 * intern applications. Reimplementing their scale rather than inventing one is
 * the point: a student learns how the system that actually screens them reads
 * their résumé, not how CampusQuest feels about it.
 *
 * Two departures from the source, both deliberate:
 *
 *  - hiring-agent enriches with live GitHub data before scoring. That would
 *    make a student's score depend on a third-party API being reachable, so
 *    the prompt scores what the document itself evidences and says so.
 *  - hiring-agent returns `areas_for_improvement` as prose for a recruiter's
 *    reading. Here each improvement carries the category it lifts and the
 *    points it is worth, because the student is the one who has to act on it.
 */
import type { AtsScore } from "@campusquest/shared";
import { chatEndpoint, databricksChat, jsonFromReply } from "@/lib/resume/databricks-chat";

/** Category ceilings, exactly as the rubric defines them. */
const MAX = { openSource: 35, selfProjects: 30, production: 25, technicalSkills: 10 } as const;
const BONUS_MAX = 20;
/** Categories (100) plus bonus (20). Deductions bring it down from there. */
const OVERALL_MAX = 120;

const SYSTEM = [
  "You are evaluating a résumé for a Software Intern position, using HackerRank's rubric.",
  "",
  "FAIRNESS — scores must NEVER depend on the candidate's name, gender, college or",
  "university, CGPA or grades, city, or any personal characteristic. Score only",
  "technical skills, project complexity and real-world impact, open source",
  "contribution, production experience, and demonstrated problem-solving.",
  "",
  "SCORING CATEGORIES",
  `open_source (0-${MAX.openSource}): contributions to OTHER people's projects. Personal`,
  "  repositories are NOT open source contribution. If every project is the",
  "  candidate's own, this score must not exceed 10. GSoC participation scores high;",
  "  Hacktoberfest alone scores 3-5.",
  `self_projects (0-${MAX.selfProjects}): complexity and real-world impact. Tutorial projects`,
  "  (todo lists, calculators, weather apps, basic CRUD, simple sentiment analysis)",
  "  score 1-9 and cap the category at 15. Projects with no link score 30-50% lower;",
  "  a working live demo scores 10-20% higher.",
  `production (0-${MAX.production}): internships and real-world work. Founder, co-founder or`,
  "  early-employee roles at startups earn extra.",
  `technical_skills (0-${MAX.technicalSkills}): breadth and evidence of problem-solving.`,
  "",
  `BONUS (total <= ${BONUS_MAX}): GSoC +5, Girl Script Summer of Code +3, founder +3-5,`,
  "  early-stage engineer +2-3, portfolio site +2, LinkedIn +1.",
  "",
  "DEDUCTIONS: -3 to -5 per project with no link at all; -2 to -3 for a repository",
  "  link with no live demo; -1 per generically named project; -2 if every project",
  "  is a classroom or tutorial exercise.",
  "",
  "Whenever `bonus_points.total` or `deductions.total` is not zero, the matching",
  "`breakdown` or `reasons` MUST name what produced it and which project or item",
  "it applies to — 'no live demo for the Brick Kiln Detection project (-3)'.",
  "A non-zero total with no explanation is invalid; use 0 if you cannot say why.",
  "",
  "You are scoring the DOCUMENT ONLY. No GitHub or blog data is available, so do",
  "not assume contributions the résumé does not evidence, and do not deduct for",
  "the absence of data you were not given.",
  "",
  "Every `evidence` field must quote or name something actually in the résumé.",
  "",
  "IMPROVEMENTS: 3-6 concrete changes, most valuable first. Each must name what to",
  "do, not merely what is wrong — 'add a live demo link to the RAG project' rather",
  "than 'projects lack links'. `points` is your estimate of the gain.",
  "",
  "Output ONLY this JSON:",
  "{",
  '  "scores": {',
  '    "open_source": {"score": 0, "evidence": ""},',
  '    "self_projects": {"score": 0, "evidence": ""},',
  '    "production": {"score": 0, "evidence": ""},',
  '    "technical_skills": {"score": 0, "evidence": ""}',
  "  },",
  '  "bonus_points": {"total": 0, "breakdown": ""},',
  '  "deductions": {"total": 0, "reasons": ""},',
  '  "key_strengths": [""],',
  '  "areas_for_improvement": [{"title": "", "detail": "", "category": "self_projects", "points": 0}]',
  "}",
].join("\n");

/** Maps the rubric's snake_case categories onto the schema's names. */
const CATEGORY_KEYS = {
  open_source: "openSource",
  self_projects: "selfProjects",
  production: "production",
  technical_skills: "technicalSkills",
} as const;

function clamp(value: unknown, max: number): number {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.max(0, Math.min(max, Math.round(numeric)));
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * Scores a résumé. Returns null when Databricks is unavailable or its reply
 * cannot be trusted — the screen then says the score could not be computed,
 * rather than showing an invented one.
 */
export async function evaluateResume(resumeText: string): Promise<Omit<AtsScore, "scoredAt" | "stale" | "fileName"> | null> {
  const reply = await databricksChat({
    endpoint: chatEndpoint(),
    system: SYSTEM,
    // The rubric reads work, projects and skills sections; 12k covers a long
    // student résumé without paying for a whole thesis.
    user: `Résumé to evaluate:\n\n${resumeText.slice(0, 12000)}`,
    maxTokens: 3000,
  });
  if (!reply) return null;
  return parseEvaluation(reply);
}

/**
 * Reads the evaluator's reply into a score.
 *
 * Every number is clamped to the rubric's ceiling here rather than trusted:
 * the prompt states the limits, but a model that returns 40/35 for open source
 * would otherwise produce a score no student could ever reach, and the totals
 * are what the UI draws bars from.
 */
export function parseEvaluation(reply: string): Omit<AtsScore, "scoredAt" | "stale" | "fileName"> | null {
  const parsed = jsonObjectFromReply(reply);
  if (!parsed) return null;

  const rawScores = (parsed as { scores?: Record<string, unknown> }).scores;
  if (!rawScores || typeof rawScores !== "object") return null;

  const categories = {} as Record<(typeof CATEGORY_KEYS)[keyof typeof CATEGORY_KEYS], { score: number; max: number; evidence: string }>;
  for (const [rubricKey, schemaKey] of Object.entries(CATEGORY_KEYS)) {
    const entry = (rawScores as Record<string, { score?: unknown; evidence?: unknown }>)[rubricKey];
    const max = MAX[schemaKey];
    categories[schemaKey] = {
      score: clamp(entry?.score, max),
      max,
      evidence: text(entry?.evidence, "No evidence given."),
    };
  }

  // An unexplained adjustment is not usable: "−4 · None." tells a student
  // their score was cut and refuses to say why. Where the reason is missing,
  // the points are dropped rather than shown unexplained — the score moves in
  // the student's favour, which is the right direction to fail in.
  const bonusRaw = (parsed as { bonus_points?: { total?: unknown; breakdown?: unknown } }).bonus_points;
  const bonusBreakdown = text(bonusRaw?.breakdown);
  const bonus = {
    total: bonusBreakdown ? clamp(bonusRaw?.total, BONUS_MAX) : 0,
    breakdown: bonusBreakdown,
  };

  const deductionRaw = (parsed as { deductions?: { total?: unknown; reasons?: unknown } }).deductions;
  // The rubric states deductions as negatives in its prose ("-3 to -5 points")
  // and as a positive total in its JSON, so models return either sign. Take
  // the magnitude *before* clamping: clamping first would floor -4 to 0 and
  // silently drop the deduction, inflating the score.
  const deductionMagnitude = typeof deductionRaw?.total === "number" && Number.isFinite(deductionRaw.total)
    ? Math.abs(deductionRaw.total)
    : 0;
  const deductionReasons = text(deductionRaw?.reasons);
  const deductions = {
    total: deductionReasons ? clamp(deductionMagnitude, OVERALL_MAX) : 0,
    reasons: deductionReasons,
  };

  const categoryTotal = Object.values(categories).reduce((sum, entry) => sum + entry.score, 0);
  const overall = Math.max(0, Math.min(OVERALL_MAX, categoryTotal + bonus.total - deductions.total));

  const strengths = asArray((parsed as { key_strengths?: unknown }).key_strengths)
    .map((item) => text(item))
    .filter(Boolean)
    .slice(0, 5);

  const improvements = asArray((parsed as { areas_for_improvement?: unknown }).areas_for_improvement)
    .flatMap((item) => {
      // Tolerates the rubric's plain-string form as well as the richer shape.
      if (typeof item === "string") {
        return text(item) ? [{ title: text(item), detail: "", category: "self_projects", points: 0, questId: null }] : [];
      }
      const record = item as { title?: unknown; detail?: unknown; category?: unknown; points?: unknown };
      const title = text(record.title);
      if (!title) return [];
      return [{
        title,
        detail: text(record.detail),
        category: text(record.category, "self_projects"),
        points: clamp(record.points, 35),
        questId: null,
      }];
    })
    .slice(0, 6);

  return { overall, categories, bonus, deductions, strengths, improvements };
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * Finds the JSON object in a reply.
 *
 * `jsonFromReply` looks for arrays, which is what the skill passes return; the
 * evaluator returns an object, and a reasoning model wraps it in its working.
 */
function jsonObjectFromReply(reply: string): unknown {
  const direct = jsonFromReply(reply);
  if (direct && !Array.isArray(direct)) return direct;

  // Scan from the last '{' backwards so the outermost object wins over any
  // nested fragment the model wrote while reasoning.
  const starts: number[] = [];
  for (let i = 0; i < reply.length; i += 1) if (reply[i] === "{") starts.push(i);
  for (let i = starts.length - 1; i >= 0; i -= 1) {
    for (let end = reply.lastIndexOf("}"); end > starts[i]!; end = reply.lastIndexOf("}", end - 1)) {
      try {
        const candidate: unknown = JSON.parse(reply.slice(starts[i]!, end + 1));
        if (candidate && typeof candidate === "object" && "scores" in (candidate as object)) return candidate;
      } catch {
        // Keep trying shorter closes.
      }
    }
  }
  return null;
}
