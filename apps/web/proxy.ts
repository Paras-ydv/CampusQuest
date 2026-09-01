import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isForeignAuthCookie } from "@/lib/supabase/server";

/**
 * ===========================================================================
 *  SESSION REFRESH
 * ===========================================================================
 * Supabase access tokens are short-lived. Server components and route handlers
 * only ever read the session, so something has to rotate the cookie before they
 * run — that is this file's entire job.
 *
 * It deliberately does not redirect or gate routes. `requireUser` in
 * `lib/auth/session.ts` stays the single definition of "signed in", and mock
 * mode has to keep working with no Supabase configured at all.
 *
 * Next 16 renamed the `middleware` convention to `proxy`; the semantics are
 * unchanged. See node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
 */
export async function proxy(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let response = NextResponse.next({ request });

  // Mock mode: there is no session cookie to rotate.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (written) => {
        // The rotated cookie has to land on both sides: on the request, so the
        // render that follows sees the new token, and on the response, so the
        // browser stores it.
        for (const { name, value } of written) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of written) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // This call is the refresh. Removing it silently expires every session.
  await supabase.auth.getUser();

  // Repointing the app at a different Supabase project leaves the old
  // project's auth cookie in the browser. It parses fine and then fails
  // getUser(), so every route answers 401 with no explanation and no amount of
  // signing in helps — the stale cookie is still there. Clear it so the next
  // sign-in can take effect.
  for (const { name } of request.cookies.getAll()) {
    if (isForeignAuthCookie(name)) response.cookies.delete(name);
  }

  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files — including route
    // handlers, which read the same cookie the pages do.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
