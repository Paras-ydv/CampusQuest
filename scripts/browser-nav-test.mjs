#!/usr/bin/env node
/**
 * Drives the app in a real Chrome and measures what a click actually feels
 * like: how long until the UI responds at all, and how long until content is
 * on screen.
 *
 *   node scripts/browser-nav-test.mjs [base-url]
 *
 * "feedback" is the loading skeleton appearing. Before route-level loading
 * boundaries existed this read "none", because Next keeps the previous page
 * visible until the new server render finishes — a click that changes nothing
 * for a second reads as a broken button, whatever the total time says.
 *
 * Requires a signed-in session in /tmp/tok.json (see scripts/warm-genie-cache.mjs
 * for how one is obtained).
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.argv[2] || "http://localhost:3000";
const session = JSON.parse(readFileSync("/tmp/tok.json", "utf8"));
const cookieValue = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "sb-gtgcgrocyjjxdcstqdln-auth-token.0", value: cookieValue, url: BASE }]);
const page = await ctx.newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 130)); });
page.on("pageerror", (e) => errors.push("PAGEERROR: " + e.message.slice(0, 130)));
page.on("requestfailed", (r) => errors.push(`FAILED ${r.url().slice(0, 110)}`));
page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url().replace(BASE, "").slice(0, 110)}`); });

console.log(`Driving ${BASE}\n`);
await page.goto(`${BASE}/journey`, { waitUntil: "networkidle", timeout: 90000 });

const NAV = [["Quests","/quests"],["Machine","/time-machine"],["People","/people"],
             ["Messages","/messages"],["Radar","/radar"],["Research","/research"],["Journey","/journey"]];

async function pass(label) {
  console.log(label);
  for (const [name, path] of NAV) {
    const t0 = Date.now();
    await page.click(`header a:has-text("${name}")`);
    // Start the skeleton probe but do NOT await it here: on a fast route the
    // skeleton may never appear, and awaiting its timeout would be counted as
    // page latency rather than test overhead.
    const feedbackPromise = page
      .waitForSelector("[aria-busy='true']", { timeout: 3000 })
      .then(() => Date.now() - t0)
      .catch(() => -1);
    await page.waitForURL(`**${path}`, { timeout: 60000 });
    // Content is ready when the skeleton is gone and the main region has text.
    await page.waitForFunction(
      () => !document.querySelector("[aria-busy='true']") &&
            (document.querySelector("main")?.innerText?.length ?? 0) > 200,
      { timeout: 60000 },
    );
    const content = Date.now() - t0;
    const feedback = await feedbackPromise;
    const shown = feedback < 0 ? "  none" : `${String(feedback).padStart(4)}ms`;
    console.log(`  ${name.padEnd(9)} feedback ${shown}   content ${String(content).padStart(5)}ms`);
  }
}

await pass("First pass (cold server cache):");
console.log();
await pass("Second pass (warm):");

console.log(`\nerrors/4xx: ${errors.length}`);
[...new Set(errors)].slice(0, 8).forEach((e) => console.log("  " + e));
await browser.close();
