import { ResumeExtraction } from "@campusquest/shared";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { extractPdfText, looksLikePdf } from "@/lib/resume/pdf-text";
import { matchSkills } from "@/lib/resume/skill-matcher";
import { extractProfileFields } from "@/lib/resume/profile-fields";
import { resolveExtraSkills } from "@/lib/resume/skill-resolver";
import { extractSkillCandidates } from "@/lib/resume/skill-candidates";
import { classifyCandidates } from "@/lib/resume/skill-dedupe";
import { SKILLS } from "@/lib/data/skills";
import { saveResumeText } from "@/lib/backend/ats";

export const dynamic = "force-dynamic";
/** PDF parsing needs node:zlib and Buffer, so this route is not edge-safe. */
export const runtime = "nodejs";

/** Comfortably above a real résumé, low enough to bound the work per request. */
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Upload rules live in a schema so a bad file returns 400 through the same
 * ZodError branch of `errorResponse` that every other route's invalid input
 * takes, rather than a 500 with a deliberately hidden message.
 */
const Upload = z
  .instanceof(File, { message: "A résumé file is required" })
  .refine((file) => file.size > 0, "That file is empty")
  .refine((file) => file.size <= MAX_BYTES, "That résumé is larger than 5MB");

/**
 * Extracts canonical skill ids from an uploaded résumé.
 *
 * The file is parsed in memory and discarded when the response is written — it
 * is never stored, and nothing here touches the database. Writing remains the
 * job of the single `POST /api/onboarding` at the end of the flow, so a student
 * who uploads a résumé and then abandons onboarding leaves nothing behind.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    const file = Upload.parse((await request.formData()).get("resume"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    z.literal(true, { message: "Upload a PDF résumé" }).parse(looksLikePdf(bytes));

    const text = extractPdfText(bytes);
    const matches = matchSkills(text);
    const fields = extractProfileFields(text);

    // Two Databricks passes, both additive and best-effort: each returns
    // nothing when unconfigured, slow or unparseable, so extraction never
    // depends on either. They run together because neither needs the other's
    // answer.
    //
    //  1. Resolve phrasings the alias table cannot know — a résumé writing
    //     "retrieval augmented generation" rather than "RAG".
    //  2. Read the technologies the catalogue does not recognise at all and
    //     decide, for each, whether it is really an existing skill under
    //     another name. Only those merges are applied: a genuinely new skill
    //     is reported but never inserted, because a model must not silently
    //     add rows that gaps and quests then join on.
    // Kept so the ATS screen can score the same document later without asking
    // the student to upload it again. Only the text is stored, never the file,
    // and a failure here never fails the extraction.
    await saveResumeText(request, user.id, text, file.name);

    const found = matches.map((match) => match.skillId);
    // Candidate names are parsed locally, so the only Databricks work is the
    // judgement itself. Both calls run together.
    const candidates = extractSkillCandidates(text, found.flatMap((id) => [id, SKILLS[id].name]));
    const [resolved, verdicts] = await Promise.all([
      resolveExtraSkills(text, found),
      classifyCandidates(candidates),
    ]);
    const merged = verdicts.flatMap((verdict) => (verdict.kind === "duplicate" ? [verdict] : []));
    const unknown = verdicts.flatMap((verdict) => (verdict.kind === "new" ? [verdict.name] : []));

    // Order is preserved and duplicates collapsed, so a skill found twice —
    // once exactly, once through a merge — appears once.
    const skillIds = [...new Set([...found, ...resolved, ...merged.map((verdict) => verdict.of)])];

    return Response.json(
      ResumeExtraction.parse({
        skillIds,
        matches: [
          ...matches,
          ...resolved.map((skillId) => ({ skillId, matchedOn: "inferred from context" })),
          // Naming the résumé's own wording is what makes a merge legible:
          // the student sees "Git — matched on GitHub" rather than a skill
          // they did not think they had claimed.
          ...merged.map((verdict) => ({ skillId: verdict.of, matchedOn: verdict.candidate })),
        ],
        // Reported so the student knows what we could not place, and so the
        // gaps in the catalogue are visible. Nothing is inserted from this.
        unknownSkills: unknown,
        ...fields,
        // A PDF of scanned pages parses fine and simply has no words in it. The
        // client distinguishes that from "read it, found no known skills".
        empty: text.length === 0,
      }),
    );
  } catch (error) {
    return errorResponse(error, "Could not read that résumé");
  }
}
