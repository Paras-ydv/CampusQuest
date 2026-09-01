"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@campusquest/db-types";

/**
 * The browser half of the auth seam. Only ever holds the anon key, and its one
 * job is starting the OAuth redirect — every read the UI performs still goes
 * through `lib/data/client.ts` and the route handlers behind it.
 *
 * Returns null when Supabase is unconfigured, which is what keeps mock mode
 * working: the sign-in screen falls back to its demo path instead of throwing.
 */

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let cached: SupabaseClient<Database> | null = null;

export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  if (!url || !anonKey) return null;
  // One instance per tab: each call would otherwise register its own auth
  // listener and storage subscription against the same cookie.
  cached ??= createBrowserClient<Database>(url, anonKey);
  return cached;
}

export function isSupabaseConfiguredInBrowser(): boolean {
  return Boolean(url && anonKey);
}
