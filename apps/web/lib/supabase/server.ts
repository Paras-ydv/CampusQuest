import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@campusquest/db-types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * The Supabase project this deployment talks to. Auth cookies are named
 * `sb-<ref>-auth-token`, so the ref is what distinguishes our session cookie
 * from one left behind by a different project.
 */
const projectRef = url?.match(/^https?:\/\/([a-z0-9]+)\.supabase\./)?.[1];

/** True for `sb-<our-ref>-auth-token`, including its `.0` / `.1` chunks. */
function isOurAuthCookie(name: string): boolean {
  return projectRef
    ? new RegExp(`^sb-${projectRef}-auth-token(?:\\.\\d+)?$`).test(name)
    : /-auth-token(?:\.\d+)?$/.test(name);
}

function accessTokenFromRequest(request?: Request): string | undefined {
  const header = request?.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (header) return header;
  const cookie = request?.headers.get("cookie");
  if (!cookie) return undefined;
  const entries = cookie.split(/;\s*/).map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [part, ""] : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
  });
  // Scoped to our own project. A cookie from another Supabase project parses
  // perfectly well and then fails getUser(), which surfaces as an opaque 401
  // on every route — so it is ignored here rather than forwarded.
  const authPieces = entries
    .filter(([name]) => isOurAuthCookie(name))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, value]) => value)
    .join("");
  if (!authPieces) return undefined;
  try {
    const decoded = authPieces.startsWith("base64-")
      ? Buffer.from(authPieces.slice("base64-".length), "base64url").toString("utf8")
      : authPieces;
    const session = JSON.parse(decoded) as { access_token?: unknown } | [unknown, unknown?];
    return typeof session === "object" && !Array.isArray(session) && typeof session.access_token === "string"
      ? session.access_token
      : Array.isArray(session) && typeof session[0] === "string" ? session[0] : undefined;
  } catch { return undefined; }
}

/** Exported for the proxy, which clears cookies belonging to other projects. */
export function isForeignAuthCookie(name: string): boolean {
  return /^sb-[a-z0-9]+-auth-token(?:\.\d+)?$/.test(name) && !isOurAuthCookie(name);
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function localFallbackEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.CAMPUSQUEST_LOCAL_FALLBACK === "true";
}

/** A per-request client. Browser-visible credentials are limited to the anon key. */
export function createRequestSupabaseClient(request?: Request): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null;
  const token = accessTokenFromRequest(request);
  return createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

/**
 * The cookie-store client, for server components and route handlers that read
 * the session without an explicit `Request` (`getSession()` with no argument).
 *
 * Cookie writes are attempted but tolerated to fail: a Server Component render
 * cannot set headers, and it does not need to — `proxy.ts` has already
 * refreshed the session cookie for this request before rendering began.
 */
export async function createServerSupabaseClient(): Promise<SupabaseClient<Database> | null> {
  if (!url || !anonKey) return null;
  const { cookies } = await import("next/headers");
  const store = await cookies();
  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (written) => {
        try {
          for (const { name, value, options } of written) store.set(name, value, options);
        } catch {
          // Server Component render — proxy.ts owns the refresh instead.
        }
      },
    },
  });
}

/**
 * Resolves the right client for the caller: route handlers hand over the
 * request they were given, server components have none and read the cookie
 * store instead. Passing `undefined` to `createRequestSupabaseClient` would
 * silently produce an anonymous client, which RLS then answers with nothing.
 */
export async function supabaseForCaller(request?: Request): Promise<SupabaseClient<Database> | null> {
  return request ? createRequestSupabaseClient(request) : createServerSupabaseClient();
}

/** Service role is deliberately server-only and only used for cross-user matching. */
export function createAdminSupabaseClient(): SupabaseClient<Database> | null {
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) return null;
  return createClient<Database>(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
