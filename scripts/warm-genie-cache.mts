#!/usr/bin/env -S npx tsx
/**
 * Warms the Genie answer cache for a student.
 *
 * Genie takes roughly twenty seconds to compose an answer, and no amount of
 * client work changes that — it is the provider's time, not ours. What we do
 * control is that an identical question from the same student is served from
 * `genie_messages` instead of being asked again, which returns in well under a
 * second.
 *
 * Running this before a demo means every suggested question on every screen
 * answers instantly, with the real warehouse-produced answer and the real SQL —
 * nothing is faked, it is simply already known.
 *
 *   npx tsx scripts/warm-genie-cache.mts [--base <url>] [--email <addr>]
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY from the environment, plus
 * CAMPUSQUEST_DEMO_PASSWORD (or --password) for the sign-in.
 */
import { genieSuggestionsFor } from "../apps/web/lib/data/genie-context.ts";

const args = process.argv.slice(2);
const arg = (flag: string, fallback: string) => {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const BASE = arg("--base", "http://localhost:3000").replace(/\/$/, "");
const EMAIL = arg("--email", "kartikeya@campus.edu");
const PASSWORD = arg("--password", process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo");
// Previews behind Vercel Deployment Protection need this; harmless otherwise.
const BYPASS = process.env.VERCEL_AUTOMATION_BYPASS_SECRET ?? "";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !ANON) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required");
  process.exit(1);
}

/** Every screen that offers Genie suggestions. */
const ROUTES = ["/journey", "/time-machine", "/radar", "/research", "/people", "/quests", "/messages"];

async function signIn(): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON!, "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const body = await response.json() as { access_token?: string; msg?: string; error_description?: string };
  if (!body.access_token) throw new Error(`Sign-in failed: ${body.msg ?? body.error_description ?? response.status}`);
  return body.access_token;
}

/** Drives one question to completion and reports how long it took. */
async function ask(token: string, question: string): Promise<{ ms: number; ok: boolean; note: string }> {
  const started = Date.now();
  const response = await fetch(`${BASE}/api/genie/ask`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      ...(BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {}),
    },
    body: JSON.stringify({ question }),
  });
  if (!response.ok || !response.body) {
    return { ms: Date.now() - started, ok: false, note: `HTTP ${response.status}` };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let note = "";
  let ok = false;
  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const event = JSON.parse(line.slice(6)) as { type: string; message?: string };
      if (event.type === "done") ok = true;
      if (event.type === "error") note = event.message?.slice(0, 70) ?? "error";
    }
    if (done) break;
  }
  return { ms: Date.now() - started, ok, note };
}

const token = await signIn();
const questions = [...new Set(ROUTES.flatMap((route) => genieSuggestionsFor(route).map((s) => s.question)))];

console.log(`Warming ${questions.length} questions for ${EMAIL} against ${BASE}\n`);
let warmed = 0;
for (const [index, question] of questions.entries()) {
  process.stdout.write(`  [${index + 1}/${questions.length}] ${question.slice(0, 58).padEnd(60)}`);
  const { ms, ok, note } = await ask(token, question);
  if (ok) warmed += 1;
  console.log(`${String(ms).padStart(6)}ms  ${ok ? "ok" : `FAILED ${note}`}`);
}

console.log(`\n${warmed}/${questions.length} cached. Verifying a sample is now served from cache:`);
for (const question of questions.slice(0, 3)) {
  const { ms, ok } = await ask(token, question);
  console.log(`  ${String(ms).padStart(6)}ms  ${ok ? "cached" : "MISS"}  ${question.slice(0, 56)}`);
}
