import { ApiError } from "@campusquest/shared";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function errorResponse(error: unknown, fallback = "Request failed"): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json(ApiError.parse({ error: "VALIDATION_ERROR", message: "Invalid request", details: error.issues }), { status: 400 });
  }
  const message = error instanceof Error ? error.message : fallback;
  const status = message === "UNAUTHENTICATED" ? 401 : message === "FORBIDDEN" ? 403 : message === "NOT_FOUND" ? 404 : 500;
  return NextResponse.json(ApiError.parse({ error: status === 500 ? "INTERNAL_ERROR" : message, message: status === 500 ? fallback : message }), { status });
}

export function parseQuery(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams.entries());
}
