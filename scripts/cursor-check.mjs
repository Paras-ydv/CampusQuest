import { chromium } from "playwright";
import { readFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const session = JSON.parse(readFileSync("/tmp/tok.json", "utf8"));
const browser = await chromium.launch({ channel: "chrome", headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies([{ name: "sb-gtgcgrocyjjxdcstqdln-auth-token.0",
  value: "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url"), url: BASE }]);
const page = await ctx.newPage();

for (const path of ["/", "/journey", "/quests", "/time-machine", "/people", "/radar", "/research", "/messages", "/sign-in"]) {
  await page.goto(BASE + path, { waitUntil: "networkidle", timeout: 90000 });
  const report = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('button, a[href], [role="button"], summary, label[for], select, input[type="checkbox"], input[type="radio"]')];
    const bad = [];
    let pointer = 0, notAllowed = 0;
    for (const el of nodes) {
      const c = getComputedStyle(el).cursor;
      const disabled = el.disabled || el.getAttribute("aria-disabled") === "true";
      if (disabled) { if (c === "not-allowed") notAllowed++; else bad.push(`${el.tagName}[disabled] -> ${c}`); continue; }
      if (c === "pointer") pointer++;
      else bad.push(`${el.tagName}${el.className ? "." + String(el.className).split(" ")[0] : ""} -> ${c}`);
    }
    return { total: nodes.length, pointer, notAllowed, bad: [...new Set(bad)].slice(0, 5) };
  });
  const ok = report.bad.length === 0 ? "OK" : `${report.bad.length} WRONG`;
  console.log(`  ${path.padEnd(14)} ${String(report.total).padStart(3)} interactive | pointer ${String(report.pointer).padStart(3)} | disabled ${report.notAllowed} | ${ok}`);
  report.bad.forEach((b) => console.log(`       ${b}`));
}
await browser.close();
