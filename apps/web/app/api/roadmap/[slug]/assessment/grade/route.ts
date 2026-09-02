import { AssessmentResult, GradeAssessmentInput, type AssessmentAward } from "@campusquest/shared";
import { errorResponse } from "@/lib/api";
import { requireUser } from "@/lib/auth/session";
import { gradeAssessment } from "@/lib/roadmap/assessment";
import { awardAssessment } from "@/lib/roadmap/assessment-award";

export const dynamic = "force-dynamic";

/**
 * Marks a submitted attempt and, on a pass, records what it was worth.
 *
 * The answer key comes from the signed token rather than from the request or
 * from storage, so there is nothing here for the client to influence except
 * which options it chose. The roadmap awarded against is the one named inside
 * that token too — the `[slug]` in the URL is only what makes this route sit
 * with the one that issued it.
 */
export async function POST(request: Request) {
  try {
    const user = await requireUser(request);
    const input = GradeAssessmentInput.parse(await request.json());

    const graded = gradeAssessment(input);
    // A token we did not sign, or one an hour past its issue. Both are the
    // same to the student: start the attempt again.
    if (!graded) throw new Error("FORBIDDEN");

    // Recording is allowed to fail without taking the mark with it. The
    // student answered the questions either way, and returning a 500 would
    // throw away a passed attempt because a write did not land. The cause is
    // logged rather than sent, and the client says plainly that nothing was
    // saved.
    let award: AssessmentAward | null = null;
    if (graded.passed) {
      try {
        award = await awardAssessment(request, user.id, graded.slug);
      } catch (error) {
        console.error("[assessment] passed but could not record it —", error);
      }
    }
    return Response.json(AssessmentResult.parse({ ...graded.result, award }));
  } catch (error) {
    return errorResponse(error, "Could not mark the assessment");
  }
}
