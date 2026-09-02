#!/usr/bin/env node
/**
 * Checks in a real browser that the connection flow updates without a reload.
 *
 *   node scripts/live-updates-test.mjs [base-url]
 *
 * The API-level flow is covered by connection-flow-test.mjs. What that cannot
 * see is the thing people actually complained about: a request that only shows
 * up after F5, a newly accepted person missing from Messages until you reload,
 * and a system `window.prompt` where a themed dialog belongs. Two Chrome
 * contexts, two students, nothing reloaded.
 */
import { chromium } from "playwright";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON,
        SUPABASE_SERVICE_ROLE_KEY: SERVICE } = process.env;
const PASSWORD = process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo";
const REF = new URL(SB).hostname.split(".")[0];

let failures = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
};

async function signIn(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const session = await r.json();
  if (!session.access_token) throw new Error(`sign-in failed for ${email}`);
  return session;
}

/** @supabase/ssr splits an oversized session cookie across numbered chunks. */
function authCookies(session) {
  const encoded = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  const chunks = encoded.match(/.{1,3180}/g) ?? [encoded];
  return chunks.map((value, i) => ({ name: `sb-${REF}-auth-token.${i}`, value, url: BASE }));
}

async function openAs(browser, email) {
  const session = await signIn(email);
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addCookies(authCookies(session));
  const page = await ctx.newPage();
  page.on("pageerror", (e) => check(`no page error (${email})`, false, e.message.slice(0, 110)));
  return { page, id: session.user.id, email };
}

/*
 * Start clean. A leftover connection would make every check pass vacuously,
 * and a leftover thread would put the other person in the conversation list
 * before anyone accepted anything.
 */
const clear = async (a, b) => {
  const list = `("${a}","${b}")`;
  const headers = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, "Content-Type": "application/json" };
  const rest = (path, init) => fetch(`${SB}/rest/v1/${path}`, { headers, ...init });
  await rest(`connection_requests?requester_id=in.${list}&recipient_id=in.${list}`, { method: "DELETE" });
  await rest(`connections?user_a_id=in.${list}&user_b_id=in.${list}`, { method: "DELETE" });

  const mine = await (await rest(`thread_members?user_id=eq.${a}&select=thread_id`)).json();
  const theirs = await (await rest(`thread_members?user_id=eq.${b}&select=thread_id`)).json();
  const shared = mine.map((r) => r.thread_id).filter((id) => theirs.some((r) => r.thread_id === id));
  for (const id of shared) {
    await rest(`messages?thread_id=eq.${id}`, { method: "DELETE" });
    await rest(`thread_members?thread_id=eq.${id}`, { method: "DELETE" });
    await rest(`threads?id=eq.${id}`, { method: "DELETE" });
  }
};

const browser = await chromium.launch({ channel: "chrome", headless: true });
const aarav = await openAs(browser, "aarav@campus.edu");
const ishita = await openAs(browser, "ishita@campus.edu");
await clear(aarav.id, ishita.id);
console.log(`Two students in two browsers against ${BASE}\n`);

console.log("1. The connect dialog is themed, not a system prompt");
await aarav.page.goto(`${BASE}/people`, { waitUntil: "networkidle", timeout: 90000 });
let dialogHandled = false;
aarav.page.on("dialog", async (d) => { dialogHandled = true; await d.dismiss(); });

// Narrow to her with the search box: the match list is paged, so her card is
// not necessarily on the first page.
await aarav.page.getByPlaceholder("Search name, skill or intent").fill("Ishita");
let card = aarav.page.locator("article", { hasText: "Ishita" }).first();
await card.waitFor({ state: "visible", timeout: 20000 });

/*
 * The match list is cached per user for a minute on the server, and the reset
 * above writes straight to Postgres, so a run started less than that after a
 * previous one can still be served a card that says "Connected". Reload past
 * the TTL rather than reporting a failure that is really staleness.
 */
const connect = () => card.getByRole("button", { name: /^connect$/i }).first();
for (let waited = 0; waited < 75 && !(await connect().count()); waited += 5) {
  await aarav.page.waitForTimeout(5000);
  await aarav.page.reload({ waitUntil: "networkidle" });
  await aarav.page.getByPlaceholder("Search name, skill or intent").fill("Ishita");
  card = aarav.page.locator("article", { hasText: "Ishita" }).first();
  await card.waitFor({ state: "visible", timeout: 20000 });
}
await card.scrollIntoViewIfNeeded();
await connect().click();

const dialog = aarav.page.getByRole("dialog");
await dialog.waitFor({ state: "visible", timeout: 10000 }).catch(() => {});
check("a themed dialog opens", await dialog.isVisible());
check("no native prompt was used", !dialogHandled);
check("it names the person and their email",
      (await dialog.innerText()).includes("ishita@campus.edu"));
check("it has a note field", await dialog.locator("textarea").isVisible());

// Open her People page first, so what follows is a genuinely live arrival
// rather than a fresh server render that happens to include the request.
await ishita.page.goto(`${BASE}/people`, { waitUntil: "networkidle", timeout: 90000 });
const herRequestsBefore = await ishita.page.locator("#requests").count();

console.log("\n2. The sent request appears without a reload");
const noteText = `Live test ${Date.now()}`;
await dialog.locator("textarea").fill(noteText);
const urlBefore = aarav.page.url();
await dialog.getByRole("button", { name: /send request/i }).click();

const requests = aarav.page.locator("#requests");
await requests.waitFor({ state: "visible", timeout: 20000 }).catch(() => {});
check("the requests section shows it", await requests.isVisible());
check("marked as sent", /sent/i.test(await requests.innerText().catch(() => "")));
check("carrying the note", (await requests.innerText().catch(() => "")).includes(noteText));
check("without navigating away", aarav.page.url() === urlBefore, aarav.page.url());

console.log("\n3. It reaches the other student's already-open page");
check("nothing was waiting on her when she loaded", herRequestsBefore === 0);
const herRequests = ishita.page.locator("#requests");
await herRequests.waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
check("it appears without her reloading", await herRequests.isVisible());
check("the note is the one he just typed",
      (await herRequests.innerText().catch(() => "")).includes(noteText));
check("as an incoming request", /wants to connect/i.test(await herRequests.innerText().catch(() => "")));

console.log("\n4. Accepting unlocks Messages without a reload");
// She opens Messages first, then accepts in another tab — the case that used
// to need F5 before his name showed up.
const herMessages = await ishita.page.context().newPage();
await herMessages.goto(`${BASE}/messages`, { waitUntil: "networkidle", timeout: 90000 });
const startList = herMessages.locator("aside");
const beforeAccept = await startList.innerText();
check("Aarav is not offered before accepting", !beforeAccept.includes("aarav@campus.edu"));

await herRequests.getByRole("button", { name: /^accept$/i }).first().click();
await herMessages.waitForFunction(
  () => document.querySelector("aside")?.innerText?.includes("aarav@campus.edu") ?? false,
  { timeout: 30000 },
).catch(() => {});
const afterAccept = await herMessages.locator("aside").innerText();
check("he appears in Messages on his own", afterAccept.includes("aarav@campus.edu"));

if (afterAccept.includes("aarav@campus.edu")) {
  await herMessages.getByRole("button", { name: /aarav@campus\.edu/i }).first().click()
    .catch(async () => { await herMessages.locator("aside button", { hasText: "Aarav" }).first().click(); });
  const composer = herMessages.getByLabel("Message");
  await composer.fill("Ready to start.");
  await composer.press("Enter");
  await herMessages.waitForFunction(
    () => document.body.innerText.includes("Ready to start."),
    { timeout: 20000 },
  ).catch(() => {});
  check("and she can message him straight away",
        (await herMessages.locator("main").innerText()).includes("Ready to start."));
}

await browser.close();
console.log(`\n${failures === 0 ? "All checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
