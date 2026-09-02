#!/usr/bin/env node
/**
 * End-to-end test of the connection and messaging flow across four students.
 *
 *   node scripts/connection-flow-test.mjs [base-url]
 *
 * Exercises the rules the product now enforces: you cannot message someone you
 * are not connected to, a request is visible to the recipient in both People
 * and their notifications, accepting creates the connection, declining does
 * not, and only then does a thread open.
 *
 * Runs against real accounts through the real API — nothing is stubbed.
 */
const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const { NEXT_PUBLIC_SUPABASE_URL: SB, NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON } = process.env;
if (!SB || !ANON) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY are required");
  process.exit(1);
}

const PASSWORD = process.env.CAMPUSQUEST_DEMO_PASSWORD ?? "campusquest-demo";
const USERS = {
  kartikeya: "kartikeya@campus.edu",
  meera: "meera@campus.edu",
  aarav: "aarav@campus.edu",
  ishita: "ishita@campus.edu",
};

let failures = 0;
function check(label, ok, detail = "") {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
}

async function signIn(email) {
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: ANON, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const body = await r.json();
  if (!body.access_token) throw new Error(`sign-in failed for ${email}: ${body.msg ?? r.status}`);
  return { email, token: body.access_token, id: body.user.id };
}

async function api(user, path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${user.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: r.status, body };
}

const people = {};
for (const [key, email] of Object.entries(USERS)) people[key] = await signIn(email);
console.log(`Signed in ${Object.keys(people).length} students against ${BASE}\n`);

/*
 * Start from a known state, or the run is not repeatable: a connection made by
 * the previous run would make "messaging without a connection is refused" pass
 * for the wrong reason. Clearing connections needs the service-role key, since
 * RLS deliberately gives a student no way to delete one.
 */
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;
console.log("Reset: clearing requests and connections between the four students");
if (!SERVICE_ROLE) {
  console.log("  SUPABASE_SERVICE_ROLE_KEY not set — cannot reset, results may be stale");
} else {
  const ids = Object.values(people).map((p) => p.id);
  const admin = (path, init) =>
    fetch(`${SB}/rest/v1/${path}`, {
      ...init,
      headers: { apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
  const list = ids.map((id) => `"${id}"`).join(",");
  await admin(`connection_requests?requester_id=in.(${list})&recipient_id=in.(${list})`, { method: "DELETE" });
  await admin(`connections?user_a_id=in.(${list})&user_b_id=in.(${list})`, { method: "DELETE" });
  console.log("  cleared");
}
console.log();

console.log("1. Messaging without a connection is refused");
{
  const r = await api(people.aarav, "/api/threads", {
    method: "POST",
    body: JSON.stringify({ memberIds: [people.ishita.id] }),
  });
  check("Aarav cannot open a thread with Ishita", r.status >= 400,
        `HTTP ${r.status} ${typeof r.body === "object" ? r.body?.message ?? "" : ""}`.trim());
}

console.log("\n2. A request reaches the recipient");
let requestId = null;
{
  const sent = await api(people.aarav, "/api/people/connection-requests", {
    method: "POST",
    body: JSON.stringify({ peerId: people.ishita.id, message: "Want to build the robotics demo together?" }),
  });
  check("Aarav sends Ishita a request", sent.status === 201, `HTTP ${sent.status}`);

  const inbox = await api(people.ishita, "/api/people/requests");
  const incoming = (inbox.body ?? []).filter((r) => r.direction === "incoming");
  const fromAarav = incoming.find((r) => r.peerId === people.aarav.id);
  requestId = fromAarav?.id ?? null;
  check("Ishita sees it as incoming", Boolean(fromAarav));
  check("it carries Aarav's name and email",
        fromAarav?.peerName?.length > 0 && fromAarav?.peerEmail?.includes("@"),
        `${fromAarav?.peerName} <${fromAarav?.peerEmail}>`);
  check("the note came through", fromAarav?.message?.includes("robotics"));

  const mine = await api(people.aarav, "/api/people/requests");
  check("Aarav sees it as outgoing",
        (mine.body ?? []).some((r) => r.direction === "outgoing" && r.peerId === people.ishita.id));

  const notes = await api(people.ishita, "/api/notifications");
  const note = (notes.body ?? []).find((n) => n.kind === "connection_request" && n.title.includes("Aarav"));
  check("it appears in Ishita's notifications", Boolean(note), note?.title);
  check("the notification links to the requests section", note?.href === "/people#requests", note?.href);
}

console.log("\n3. Accepting connects them, and only then can they message");
{
  const accept = await api(people.ishita, `/api/people/connection-requests/${requestId}`, {
    method: "PATCH", body: JSON.stringify({ status: "accepted" }),
  });
  check("Ishita accepts", accept.status === 200 && accept.body?.status === "accepted");

  const peers = await api(people.aarav, "/api/people/matches");
  const ishitaCard = (peers.body ?? []).find((p) => p.id === people.ishita.id);
  check("Aarav's card for Ishita reads connected",
        ishitaCard?.connection === "connected", ishitaCard?.connection ?? "not in matches");

  const thread = await api(people.aarav, "/api/threads", {
    method: "POST", body: JSON.stringify({ memberIds: [people.ishita.id] }),
  });
  check("a thread now opens", thread.status === 201, `HTTP ${thread.status}`);

  if (thread.status === 201) {
    const msg = await api(people.aarav, `/api/threads/${thread.body.id}/messages`, {
      method: "POST", body: JSON.stringify({ body: "Great — starting on the vision pipeline." }),
    });
    check("Aarav can send a message", msg.status === 201);

    const seen = await api(people.ishita, `/api/threads/${thread.body.id}/messages`);
    check("Ishita receives it", (seen.body?.items ?? []).some((m) => m.body.includes("vision pipeline")));

    const notes = await api(people.ishita, "/api/notifications");
    const msgNote = (notes.body ?? []).find((n) => n.kind === "message" && n.title.includes("Aarav"));
    check("the message shows in her notifications", Boolean(msgNote));
    check("and links to that thread",
          msgNote?.href === `/messages?thread=${thread.body.id}`, msgNote?.href);
  }
}

console.log("\n4. Declining does not connect");
{
  const sent = await api(people.meera, "/api/people/connection-requests", {
    method: "POST", body: JSON.stringify({ peerId: people.kartikeya.id, message: "Hi!" }),
  });
  check("Meera sends Kartikeya a request", sent.status === 201, `HTTP ${sent.status}`);

  const inbox = await api(people.kartikeya, "/api/people/requests");
  const req = (inbox.body ?? []).find((r) => r.direction === "incoming" && r.peerId === people.meera.id);
  check("Kartikeya sees it", Boolean(req));

  if (req) {
    const rejected = await api(people.kartikeya, `/api/people/connection-requests/${req.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "rejected" }),
    });
    check("he declines it", rejected.status === 200 && rejected.body?.status === "rejected");

    const after = await api(people.kartikeya, "/api/people/requests");
    check("it leaves his pending list",
          !(after.body ?? []).some((r) => r.id === req.id));

    const thread = await api(people.meera, "/api/threads", {
      method: "POST", body: JSON.stringify({ memberIds: [people.kartikeya.id] }),
    });
    check("Meera still cannot message him", thread.status >= 400, `HTTP ${thread.status}`);
  }
}

console.log("\n5. A declined request can be sent again");
{
  const again = await api(people.meera, "/api/people/connection-requests", {
    method: "POST", body: JSON.stringify({ peerId: people.kartikeya.id, message: "Second try — new project" }),
  });
  check("Meera can ask Kartikeya again after being declined", again.status === 201, `HTTP ${again.status}`);

  const inbox = await api(people.kartikeya, "/api/people/requests");
  const req = (inbox.body ?? []).find((r) => r.direction === "incoming" && r.peerId === people.meera.id);
  check("it reaches him as pending again", Boolean(req));
  check("with the new note", req?.message?.includes("Second try"), req?.message);
  if (req) {
    await api(people.kartikeya, `/api/people/connection-requests/${req.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "rejected" }),
    });
  }
}

console.log("\n6. Requests cannot be acted on by the wrong person");
{
  const sent = await api(people.meera, "/api/people/connection-requests", {
    method: "POST", body: JSON.stringify({ peerId: people.aarav.id }),
  });
  const inbox = await api(people.aarav, "/api/people/requests");
  const req = (inbox.body ?? []).find((r) => r.direction === "incoming" && r.peerId === people.meera.id);
  if (req) {
    const hijack = await api(people.ishita, `/api/people/connection-requests/${req.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "accepted" }),
    });
    check("a third party cannot accept someone else's request", hijack.status >= 400, `HTTP ${hijack.status}`);

    const selfAccept = await api(people.meera, `/api/people/connection-requests/${req.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "accepted" }),
    });
    check("the sender cannot accept their own", selfAccept.status >= 400, `HTTP ${selfAccept.status}`);
    await api(people.aarav, `/api/people/connection-requests/${req.id}`, {
      method: "PATCH", body: JSON.stringify({ status: "rejected" }),
    });
  } else {
    check("setup: Aarav received Meera's request", false, `HTTP ${sent.status}`);
  }
}

console.log(`\n${failures === 0 ? "All checks passed" : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
