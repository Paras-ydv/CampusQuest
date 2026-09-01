"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

/**
 * The live half of the sign-in screen. When Supabase is configured this starts
 * Google OAuth; when it is not, it keeps P1's demo path so the UI is still
 * workable with no backend running.
 */
export function GoogleSignIn({ configured }: { configured: boolean }) {
  const searchParams = useSearchParams();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The callback route redirects back here with a reason when it fails.
  const callbackError = searchParams.get("error");
  const message = error ?? callbackError;

  if (!configured) {
    return (
      <>
        <ButtonLink href="/onboarding" size="lg" className="w-full">
          Continue with Google
        </ButtonLink>
        <p className="mt-3 font-mono text-[0.6875rem] tracking-[0.04em] text-faint uppercase">
          Demo mode — no Supabase project configured
        </p>
      </>
    );
  }

  async function startSignIn() {
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return;

    setPending(true);
    setError(null);

    // Same-origin only: `next` is echoed back to the callback route, which
    // validates it again before redirecting.
    const next = searchParams.get("next");
    const callback = new URL("/auth/callback", window.location.origin);
    if (next?.startsWith("/") && !next.startsWith("//")) {
      callback.searchParams.set("next", next);
    }

    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    // On success the browser is already navigating away, so this only runs
    // when the redirect never started.
    if (oauthError) {
      setError(oauthError.message);
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="lg"
        className="w-full"
        onClick={startSignIn}
        disabled={pending}
      >
        {pending ? "Redirecting…" : "Continue with Google"}
      </Button>

      {message ? (
        <p
          role="alert"
          className="mt-3 border-l-2 border-hot pl-3 font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-hot"
        >
          {message}
        </p>
      ) : null}
    </>
  );
}
