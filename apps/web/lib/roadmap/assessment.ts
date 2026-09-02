import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import {
  Assessment,
  AssessmentResult,
  type AssessmentAward,
  type GradeAssessmentInput,
  type RoadmapOutline,
} from "@campusquest/shared";
import { z } from "zod";
import { databricksChat } from "@/lib/resume/databricks-chat";

/**
 * ===========================================================================
 *  ROADMAP ASSESSMENT
 * ===========================================================================
 * Ten multiple-choice questions on the subject of a finished roadmap, written
 * by a Databricks model serving endpoint.
 *
 * Genie was the obvious first choice and is the wrong one. It is an agent over
 * the CampusQuest data room, and asked for questions about Docker it answers
 * "This question is unrelated to the database schema and cannot be answered
 * using the available tables" — verified against the live space, not assumed.
 * The Foundation Model API in the same workspace does the job with the same
 * host and token, through the transport résumé extraction already uses.
 *
 * Only the topic is sent. The outline, the student's ticks and every campus
 * fact stay here, because none of them are needed to ask about Docker and each
 * one is another thing that could be quoted back inside a question.
 *
 * Nothing is invented locally when the reply cannot be parsed. A canned quiz
 * presented as a generated one would be telling the student they were assessed
 * when they were not.
 *
 * Because passing awards a skill and experience, the answer key never reaches
 * the browser. It travels as an HMAC-signed token the client hands back when
 * it submits, so the marking happens here with nothing to tamper with and
 * nothing to store between the two requests.
 */

/** Percentage needed to pass. */
const PASS_MARK = 80;

/**
 * Experience for a pass, fixed rather than scaled by score.
 *
 * Quests carry their own `xp` and are worth more, which is the intended
 * ordering: this is ten questions, a quest is something built.
 */
const ASSESSMENT_XP = 120;

const QUESTION_COUNT = 10;

/**
 * A general instruct model rather than the reasoning model résumé extraction
 * defaults to. Writing questions is generation, not judgement, and a reasoning
 * model spends most of its token budget on working nobody reads.
 */
function endpoint(): string {
  return process.env.DATABRICKS_ASSESSMENT_ENDPOINT || "databricks-meta-llama-3-3-70b-instruct";
}

/**
 * The outline title as a subject to be examined on.
 *
 * roadmap.sh titles its pages, not its subjects: "Docker Roadmap", "Learn Git
 * and GitHub". Asked for ten questions on the Docker Roadmap a model will
 * oblige, but the student is then told they are being tested on a roadmap
 * rather than on Docker. "Developer" is left alone — "Android Developer" is a
 * subject.
 */
function subject(title: string): string {
  return title.replace(/\s+Roadmap$/i, "").replace(/^Learn\s+/i, "");
}

/**
 * The topic goes in verbatim, so it is restricted to the outline titles we
 * ship rather than anything a caller can name. Callers pass an outline, not a
 * string, which makes that structural rather than a rule to remember.
 */
function prompt(topic: string): string {
  return [
    `Generate exactly ${QUESTION_COUNT} multiple-choice questions that test working knowledge of ${topic}.`,
    "",
    "Rules:",
    "- Reply with a JSON array and nothing else. No prose, no SQL, no markdown fences.",
    "- Each element: {\"question\": string, \"options\": [string, string, string, string], \"answer\": number, \"why\": string}",
    "- \"answer\" is the 0-based index of the correct option. Exactly one option is correct.",
    "- \"why\" is one sentence explaining the correct answer.",
    "- Vary the difficulty, and make the wrong options plausible rather than absurd.",
  ].join("\n");
}

/**
 * A question with its key, which is the shape this module works in. Only
 * `AssessmentQuestion` — the same thing minus the key — is ever serialised to
 * the browser.
 */
const GeneratedQuestion = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).length(4),
  answerIndex: z.number().int().min(0).max(3),
  explanation: z.string().nullable().default(null),
});
type GeneratedQuestion = z.infer<typeof GeneratedQuestion>;

/**
 * Pulls the JSON array out of whatever the model replied with.
 *
 * Fenced blocks and a sentence of preamble are both common enough to be worth
 * tolerating; anything else is a miss. Slicing from the first `[` to the last
 * `]` is what survives both without a parser.
 *
 * `jsonFromReply` next door is not reused: its regex is non-greedy and stops
 * at the first `]`, which here is the end of the first question's `options`.
 * It is right for the flat arrays it was written for and wrong for these.
 */
function parseQuestions(text: string): GeneratedQuestion[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end <= start) return null;

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!Array.isArray(raw)) return null;

  const questions: GeneratedQuestion[] = [];
  for (const item of raw) {
    const record = item as Record<string, unknown>;
    const parsed = GeneratedQuestion.safeParse({
      id: `q${questions.length + 1}`,
      prompt: record.question ?? record.prompt,
      options: record.options ?? record.choices,
      answerIndex: record.answer ?? record.answerIndex,
      explanation: typeof record.why === "string" ? record.why : null,
    });
    // One malformed entry does not spoil the rest — the count check below is
    // what decides whether enough of them came back to be worth showing.
    if (parsed.success) questions.push(parsed.data);
  }
  return questions.length ? questions : null;
}

/**
 * Builds one attempt.
 *
 * Two tries, because a reply that wandered out of JSON is the failure worth
 * retrying and the second attempt says so explicitly. A third would only
 * lengthen a wait the student is already sitting through — a turn runs about
 * twenty seconds.
 */
export async function generateAssessment(outline: RoadmapOutline): Promise<Assessment> {
  const topic = subject(outline.title);
  const attempts = [
    prompt(topic),
    `${prompt(topic)}\n\nYour previous reply was not a JSON array. Output only the array, starting with [ and ending with ].`,
  ];

  for (const attempt of attempts) {
    const reply = await databricksChat({
      endpoint: endpoint(),
      system: "You write exam questions. You reply with JSON only.",
      user: attempt,
      maxTokens: 3_000,
      // Not deterministic: "try a new set" has to produce a new set.
      temperature: 0.7,
      // A ten-question turn runs about twenty seconds, which is the résumé
      // default in full.
      timeoutMs: 60_000,
    });
    const questions = reply ? parseQuestions(reply) : null;
    if (questions && questions.length >= QUESTION_COUNT) {
      const chosen = questions.slice(0, QUESTION_COUNT);
      return Assessment.parse({
        slug: outline.slug,
        topic,
        passMark: PASS_MARK,
        // The key is stripped here and travels in the token instead.
        questions: chosen.map(({ id, prompt: text, options }) => ({ id, prompt: text, options })),
        token: sign({ slug: outline.slug, issuedAt: Date.now(), questions: chosen }),
      });
    }
  }
  throw new Error("ASSESSMENT_UNAVAILABLE");
}

/* ------------------------------------------------------------- the token -- */

/**
 * The signing secret.
 *
 * A dedicated `ASSESSMENT_SIGNING_SECRET` if one is set, otherwise derived
 * from the service role key, which every deployment that can award anything
 * already has. The derivation is hashed and domain-separated so the token
 * cannot be turned back into the key it came from.
 *
 * The last resort is a per-process random value. That is correct but not
 * durable: on a platform that runs several instances, a token signed by one is
 * rejected by another, and the student sees their submission refused. Set the
 * variable in production.
 */
let ephemeralSecret: string | null = null;
function secret(): string {
  const configured = process.env.ASSESSMENT_SIGNING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (configured) {
    return createHmac("sha256", "campusquest-assessment-key-v1").update(configured).digest("hex");
  }
  ephemeralSecret ??= randomUUID();
  return ephemeralSecret;
}

/** Everything marking needs, which is why none of it can be client-supplied. */
type TokenPayload = {
  slug: string;
  issuedAt: number;
  questions: GeneratedQuestion[];
};

/** An attempt is good for an hour — long enough to think, short enough to expire. */
const TOKEN_TTL_MS = 60 * 60 * 1000;

function sign(payload: TokenPayload): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const mac = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

/** Null for anything not signed by us, malformed, or stale. */
function verify(token: string): TokenPayload | null {
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;

  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const given = Buffer.from(mac);
  const want = Buffer.from(expected);
  // Length has to match before timingSafeEqual will look at the contents; it
  // throws otherwise, which would be a comparison that reports through an
  // exception rather than a boolean.
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload;
    if (!Array.isArray(payload.questions) || !payload.questions.length) return null;
    if (Date.now() - payload.issuedAt > TOKEN_TTL_MS) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------- marking -- */

/**
 * Marks one submission.
 *
 * An unanswered question is a wrong one rather than an error: the UI will not
 * let a student submit an incomplete attempt, and a request that skips the UI
 * does not get a shorter test out of it.
 *
 * Returns the slug alongside the result so the caller can award against the
 * roadmap the token was issued for, never one the client named.
 */
export function gradeAssessment(
  input: GradeAssessmentInput,
): { slug: string; result: AssessmentResult; passed: boolean } | null {
  const payload = verify(input.token);
  if (!payload) return null;

  const total = payload.questions.length;
  const correctCount = payload.questions.filter(
    (question) => input.answers[question.id] === question.answerIndex,
  ).length;
  const scorePct = Math.round((100 * correctCount) / total);
  const passed = scorePct >= PASS_MARK;

  return {
    slug: payload.slug,
    passed,
    result: AssessmentResult.parse({
      passed,
      scorePct,
      correctCount,
      total,
      answers: payload.questions.map((question) => ({
        id: question.id,
        answerIndex: question.answerIndex,
        explanation: question.explanation,
      })),
      award: null,
    }),
  };
}

export { ASSESSMENT_XP, PASS_MARK };
export type { AssessmentAward };
