import { ApiError } from "@campusquest/shared";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(error: unknown, fallback = "Request failed"): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(ApiError.parse({ error: "VALIDATION_ERROR", message: "Invalid request", details: error.issues }), { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  /*
   * Trying to finish a quest with an outstanding step is the caller's mistake,
   * not the server's. It surfaced as a 500 with the cause swallowed, which is
   * both wrong and unhelpful to anyone reading the response.
   */
  const unmetPrecondition = message === "QUEST_STEPS_NOT_VERIFIED"
    || /every quest step must be|must be verified/i.test(message);
  const status = message === "UNAUTHENTICATED" ? 401
    : message === "FORBIDDEN" ? 403
    : message === "NOT_FOUND" ? 404
    : unmetPrecondition ? 409
    : 500;
  // The response body deliberately hides the cause of a 500 from the client.
  // Without this the cause is hidden from the server too, which makes the
  // failure undebuggable from logs alone.
  if (status === 500) console.error("[api]", fallback, "—", error);
  if (status === 409) {
    return NextResponse.json(
      ApiError.parse({ error: "STEPS_OUTSTANDING", message: "Every task has to be ticked off or verified first." }),
      { status },
    );
  }
  return NextResponse.json(ApiError.parse({ error: status === 500 ? "INTERNAL_ERROR" : message, message: status === 500 ? fallback : message }), { status });
}

export function parseQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
