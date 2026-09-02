import type { Metadata } from "next";
import { Suspense } from "react";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { Reveal } from "@/components/motion/reveal";
import { WordRise } from "@/components/motion/word-rise";
import { Label } from "@/components/ui/primitives";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="grid flex-1 lg:grid-cols-2">
      {/* ---------------------------------------------------------- form -- */}
      <div className="flex items-center border-b-2 border-ink px-5 py-16 lg:border-r-2 lg:border-b-0 lg:px-14">
        <div className="w-full max-w-[26rem]">
          <Label className="mb-5">Sign in</Label>
          <WordRise
            as="h1"
            text="Pick up where you left off."
            className="k-display text-[clamp(2rem,5vw,3rem)]"
          />

          <Reveal index={4} className="mt-8">
            {/*
              GoogleSignIn reads `next`/`error` from the query string, so it
              needs a Suspense boundary — without one the whole route opts out
              of static rendering.
            */}
            <Suspense
              fallback={
                <div className="h-[3.25rem] w-full border-2 border-line-soft" />
              }
            >
              <GoogleSignIn configured={isSupabaseConfigured()} />
            </Suspense>
          </Reveal>

          <Reveal index={5} className="mt-4">
            <p className="font-mono text-[0.6875rem] leading-relaxed tracking-[0.04em] text-muted">
              Campus email addresses only. We never see your password — sign-in
              happens with Google.
            </p>
          </Reveal>
        </div>
      </div>

      {/* --------------------------------------------------------- aside -- */}
      <div className="flex items-center bg-ink px-5 py-16 text-paper lg:px-14">
        <div className="max-w-[30rem]">
          <p className="font-mono text-[0.6875rem] tracking-[0.2em] text-paper/50 uppercase">
            What you get
          </p>
          <ul className="mt-7 flex flex-col gap-6">
            {[
              [
                "Your real gap",
                "The skills that recruiting roles kept asking for and you don't yet hold — ranked by what closing each one is worth.",
              ],
              [
                "A next move, not a reading list",
                "Every gap becomes a quest with a deliverable and an XP value, and finishing one is verified rather than self-reported.",
              ],
              [
                "A résumé score, and the fixes",
                "Upload a PDF and see it scored on the rubric intern applications are screened against, with the specific changes that would raise it.",
              ],
              [
                "Ask it in plain English",
                "Genie answers questions about your own standing from campus data — and shows you the SQL it ran to get there.",
              ],
              [
                "What the roles actually asked for",
                "Alignment measured against five years of campus hiring: who recruited, what they paid, and which skills the students with offers were carrying.",
              ],
              [
                "Everything worth applying to",
                "Internships, hackathons, competitions, open-source issues and workshops, plus the research groups currently taking students.",
              ],
              [
                "The people who complete your team",
                "Students whose skills fill your gaps, and who are looking for what you already have. Connect, then message them here.",
              ],
            ].map(([title, body], i) => (
              <Reveal key={title} index={i + 2}>
                <li>
                  <h2 className="k-display text-[1.15rem]">{title}</h2>
                  <p className="mt-1.5 text-[0.88rem] leading-relaxed text-paper/65">
                    {body}
                  </p>
                </li>
              </Reveal>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
