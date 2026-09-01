import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * POST-only on purpose: a GET sign-out can be fired by a link prefetch or an
 * <img> on another site, which would log people out without them asking.
 */
export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient();
  // Clears the auth cookie through the same cookie adapter that set it.
  if (supabase) await supabase.auth.signOut();

  const origin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? new URL(request.url).origin;
  // 303 so the browser follows with GET rather than repeating the POST.
  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
