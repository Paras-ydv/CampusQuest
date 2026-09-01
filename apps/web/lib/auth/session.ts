import type { Profile } from "@campusquest/shared";
import { DEMO_PROFILE } from "@/lib/data/fixtures";
import {
  createRequestSupabaseClient,
  createServerSupabaseClient,
  localFallbackEnabled,
} from "@/lib/supabase/server";

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

/** Returns the signed-in session, or null. Never throws. */
export async function getSession(request?: Request): Promise<Session | null> {
  // Route handlers hand us the request they were given; server components have
  // no request object and read the same cookie through next/headers instead.
  const supabase = request
    ? createRequestSupabaseClient(request)
    : await createServerSupabaseClient();
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

/** The profile behind the current session. */
export async function getCurrentProfile(): Promise<Profile> {
  // → GET /api/profile with the session's token
  return DEMO_PROFILE;
}
