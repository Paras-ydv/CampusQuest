import { AtsState } from "@campusquest/shared";
import { z } from "zod";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { extractPdfText, looksLikePdf } from "@/lib/resume/pdf-text";
import { getAtsState, saveResumeText } from "@/lib/backend/ats";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 5 * 1024 * 1024;

const Upload = z
  .instanceof(File, { message: "A résumé file is required" })
  .refine((file) => file.size > 0, "That file is empty")
  .refine((file) => file.size <= MAX_BYTES, "That résumé is larger than 5MB");

/**
 * Stores a résumé for students who did not onboard with one.
 *
 * Only the extracted text is kept; the PDF is discarded with the request. This
 * replaces any résumé already stored, which is also how a student updates
 * theirs after editing the document.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);

    const file = Upload.parse((await request.formData()).get("resume"));
    const bytes = new Uint8Array(await file.arrayBuffer());
    z.literal(true, { message: "Upload a PDF résumé" }).parse(looksLikePdf(bytes));

    const text = extractPdfText(bytes);
    // A scanned résumé parses cleanly and contains no words; scoring one would
    // grade an empty document.
    z.literal(true, { message: "We couldn't find any text in that PDF — it may be a scan." })
      .parse(text.trim().length > 0);

    // Required here: a storage failure must surface, not leave the screen
    // reporting success and then rendering nothing.
    await saveResumeText(request, user.id, text, file.name, true);
    return Response.json(AtsState.parse(await getAtsState(request, user.id)));
  } catch (error) {
    return errorResponse(error, "Could not read that résumé");
  }
}
