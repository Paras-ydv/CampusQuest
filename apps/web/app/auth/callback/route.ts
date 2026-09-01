import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Where Supabase sends the browser back after Google accepts. Trades the
 * one-time `code` for a session, sets the cookie, and decides where the user
 * lands: onboarding if they have never filled in a profile, the dashboard if
 * they have.
 */

/** `next` is attacker-controllable, so only same-origin absolute paths pass. */
function safeNext(value: string | null): string | null {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

/**
 * Prefer the configured public origin: behind a proxy or on a preview
 * deployment `request.url` can carry an internal host that the browser cannot
 * resolve.
 */
function appOrigin(request: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    return `${proto}://${forwardedHost}`;
  }
  return new URL(request.url).origin;
}

function failure(request: NextRequest, reason: string): NextResponse {
  const url = new URL("/sign-in", appOrigin(request));
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  // Google can return here with a denial rather than a code.
  const denied = searchParams.get("error_description") ?? searchParams.get("error");
  if (denied) return failure(request, denied);

  const code = searchParams.get("code");
  if (!code) return failure(request, "Missing authorization code.");

  const supabase = await createServerSupabaseClient();
  if (!supabase) return failure(request, "Supabase is not configured on this deployment.");

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error || !data.user) {
    return failure(request, error?.message ?? "Could not complete sign-in.");
  }

  // An explicit `next` wins; otherwise send first-time users through
  // onboarding. `goal_role` is the profile field onboarding fills in, and the
  // signup trigger leaves it empty.
  let destination = safeNext(searchParams.get("next"));
  if (!destination) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("goal_role")
      .eq("id", data.user.id)
      .maybeSingle();
    destination = profile?.goal_role ? "/journey" : "/onboarding";
  }

  return NextResponse.redirect(new URL(destination, appOrigin(request)));
}
