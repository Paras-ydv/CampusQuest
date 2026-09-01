import { cache } from "react";
import type { Profile } from "@campusquest/shared";
import { DEMO_PROFILE } from "@/lib/data/fixtures";
import { localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";

/**
 * ===========================================================================
 *  AUTH SEAM
 * ===========================================================================
 * The shape here matches what Supabase Auth returns, so replacing the body of
 * `getSession` with a `supabase.auth.getUser()` call is the whole migration.
 *
 * `requireUser` is the helper every route handler in the app imports — P2, P3
 * and P4 all call it rather than reading the session themselves, so there is
 * exactly one place that decides what "signed in" means.
 */

export type Session = {
  user: {
    id: string;
    email: string;
    name: string;
    initials: string;
    avatarUrl: string | null;
  };
  /** Present only in the mock. Real sessions carry a Supabase JWT instead. */
  isMock: boolean;
};

const DEMO_SESSION: Session = {
  user: {
    id: DEMO_PROFILE.id,
    email: DEMO_PROFILE.email,
    name: DEMO_PROFILE.name,
    initials: DEMO_PROFILE.initials,
    avatarUrl: null,
  },
  isMock: true,
};

/**
 * Returns the signed-in session, or null. Never throws.
 *
 * Memoized per request: `supabase.auth.getUser()` is a network round trip to
 * the auth server, and the app shell alone used to make three of them before
 * rendering anything. The session cannot change mid-request, so reusing the
 * first answer is safe.
 */
export const getSession = cache(readSession);

async function readSession(request?: Request): Promise<Session | null> {
  // Route handlers hand us the request they were given; server components have
  // no request object and read the same cookie through next/headers instead.
  const supabase = await supabaseForCaller(request);
  if (!supabase) return localFallbackEnabled() ? DEMO_SESSION : null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  const meta = data.user.user_metadata ?? {};
  const name = typeof meta.name === "string" ? meta.name : data.user.email?.split("@")[0] ?? "Student";
  return { user: { id: data.user.id, email: data.user.email ?? "", name, initials: name.slice(0, 2).toUpperCase().padEnd(2, "?"), avatarUrl: typeof meta.avatar_url === "string" ? meta.avatar_url : null }, isMock: false };
}

/**
 * Returns the signed-in user or throws. Route handlers should call this so an
 * unauthenticated request fails loudly rather than silently reading nothing.
 */
export async function requireUser(request?: Request): Promise<Session["user"]> {
  const session = await getSession(request);
  if (!session) throw new Error("UNAUTHENTICATED");
  return session.user;
}

/**
 * The profile behind the current session. Server components call this during
 * render, so it reads through the same backend module `GET /api/profile` uses
 * rather than fetching the route over HTTP.
 */
export const getCurrentProfile = cache(readCurrentProfile);

async function readCurrentProfile(): Promise<Profile> {
  const session = await getSession();
  if (!session || session.isMock) return DEMO_PROFILE;
  const { getFullProfile } = await import("@/lib/backend/profile");
  try {
    return await getFullProfile(undefined, session.user.id);
  } catch (error) {
    // Only a genuinely missing row falls back — that is the pre-onboarding
    // state, and a shell is better than a crashed layout. Any other failure
    // must surface: silently showing a real signed-in user the demo student's
    // name, XP and goal role is worse than an error, because it looks correct.
    if (error instanceof Error && error.message === "NOT_FOUND") return DEMO_PROFILE;
    throw error;
  }
}
