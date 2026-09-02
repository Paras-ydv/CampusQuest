// Must precede every other import: it clears service configuration so the
// suite always exercises the fallback paths, whatever the shell exports.
import "./env-setup";
import assert from "node:assert/strict";
import test from "node:test";

import { DEMO_PROFILE, DEMO_QUESTS } from "../lib/data/fixtures";
import { deterministicEmbedding, EMBEDDING_DIMENSIONS, getOrCreateProfileEmbedding, validateEmbedding } from "../lib/embeddings";
import { rankQuests, completeQuest, verifyQuestStep } from "../lib/quest-engine";
import { resolveRoleFamily } from "../lib/data/role-families";
import { ALL_SKILLS } from "../lib/data/skills";
import { matchSkills } from "../lib/resume/skill-matcher";
import { extractPdfText, looksLikePdf } from "../lib/resume/pdf-text";
import { extractBranch, extractName, extractProfileFields, extractYear } from "../lib/resume/profile-fields";
import { parseSkillIds } from "../lib/resume/skill-resolver";
import { messageText } from "../lib/resume/databricks-chat";
import { parseVerdicts } from "../lib/resume/skill-dedupe";
import { extractSkillCandidates } from "../lib/resume/skill-candidates";
import { parseEvaluation } from "../lib/resume/ats-evaluator";
import { BRANCHES } from "../lib/data/profile-options";
import { skillPathQuests } from "../lib/skill-paths";
import { peopleMatches, scorePeer } from "../lib/people-matchmaker";
import { GET as getPeopleMatches } from "../app/api/people/matches/route";
import { researchMatches } from "../lib/research-repository";
import { createThread, listMessages, sendMessage } from "../lib/chat";
import { createConnectionRequest, respondToConnectionRequest } from "../lib/connection-requests";
import { getAlignment, simulateTimeMachine } from "../lib/timemachine";
import { runGenie } from "../lib/genie";
import { GenieClient } from "@campusquest/genie-client";
import type { Quest } from "@campusquest/shared";

const request = new Request("http://localhost/api");
const records = DEMO_QUESTS.map((quest) => ({ ...quest, difficulty: "intermediate" as const, goalRoles: ["AI/ML Engineer"] }));

test("quest ranking is deterministic and breaks tied scores by hours then id", () => {
  const ranked = rankQuests(records, { year: 3, goalRole: "AI/ML Engineer" }, { alignmentPct: 62, gaps: [{ skillId: "docker", impactPct: 12 }, { skillId: "systemdesign", impactPct: 9 }] });
  assert.equal(ranked[0]?.id, "q_docker");
  const tied = rankQuests([
    { ...records[0]!, id: "q_z", estimatedHours: 2, skillsGained: [] },
    { ...records[0]!, id: "q_a", estimatedHours: 2, skillsGained: [] },
  ], { year: 3, goalRole: "AI/ML Engineer" }, { alignmentPct: 0, gaps: [] });
  assert.deepEqual(tied.map((quest) => quest.id), ["q_a", "q_z"]);
});

test("local embeddings are finite, 1024-dimensional, and deterministic", async () => {
  const one = deterministicEmbedding("profile text");
  assert.equal(one.length, EMBEDDING_DIMENSIONS);
  assert.deepEqual(one, deterministicEmbedding("profile text"));
  assert.throws(() => validateEmbedding([1, 2]), /invalid/);
  const input = { userId: "stu_embedding", goalRole: "Engineer", interests: ["AI"], skills: [{ id: "python", name: "Python" }], projects: [], collaborationIntent: null };
  assert.deepEqual((await getOrCreateProfileEmbedding(input)).embedding, (await getOrCreateProfileEmbedding(input)).embedding);
});

test("malformed provider vectors fail closed", async () => {
  const saved = { host: process.env.DATABRICKS_HOST, token: process.env.DATABRICKS_TOKEN, endpoint: process.env.DATABRICKS_EMBEDDING_ENDPOINT, fetch: globalThis.fetch };
  process.env.DATABRICKS_HOST = "https://example.invalid";
  process.env.DATABRICKS_TOKEN = "test-token";
  process.env.DATABRICKS_EMBEDDING_ENDPOINT = "embeddings";
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ embedding: [0] }] }), { status: 200 })) as typeof fetch;
  await assert.rejects(() => getOrCreateProfileEmbedding({ userId: "malformed-provider", goalRole: "Engineer", interests: [], skills: [], projects: [] }), /invalid 1024/);
  process.env.DATABRICKS_HOST = saved.host;
  process.env.DATABRICKS_TOKEN = saved.token;
  process.env.DATABRICKS_EMBEDDING_ENDPOINT = saved.endpoint;
  globalThis.fetch = saved.fetch;
});

test("people fallback filters and preserves deterministic complementary ordering", async () => {
  const all = await peopleMatches(request, "stu_001", {});
  const robotics = await peopleMatches(request, "stu_001", { interest: "robotics" });
  assert.ok(all.length >= robotics.length);
  assert.ok(robotics.every((peer) => peer.sharedInterests.some((interest) => interest.toLowerCase().includes("robotics"))));
  assert.deepEqual((await peopleMatches(request, "stu_001", {})).map((peer) => peer.id), all.map((peer) => peer.id));
  assert.ok(all.every((peer) => peer.complementarySkills.length > 0));
  assert.ok(all.every((peer) => peer.matchPct >= 25 && peer.matchPct <= 100));
});

test("peer score prioritizes explicit gaps, strong complementary skills, and rejects identical profiles", () => {
  const skill = (id: string, proficiency: "learning" | "working" | "strong" = "working") => ({ id, name: id, category: "framework", proficiency, source: "self" as const });
  const current = { skills: [skill("react", "strong")], interests: ["Hackathons"], wantsToLearn: ["node", "postgres"] };
  const priorityCandidate = { skills: [skill("react"), skill("node", "strong"), skill("postgres", "strong")], interests: ["Hackathons"], lookingForTeam: true };
  const weakCandidate = { skills: [skill("react"), skill("figma", "learning")], interests: [], lookingForTeam: false };
  const identicalCandidate = { skills: [skill("react")], interests: ["Hackathons"], lookingForTeam: true };

  assert.ok(scorePeer(current, priorityCandidate) > scorePeer(current, weakCandidate));
  assert.equal(scorePeer(current, identicalCandidate), 0);
  assert.ok(scorePeer(current, priorityCandidate) <= 100);
});

test("people matches endpoint returns the shared PeerMatch contract", async () => {
  const response = await getPeopleMatches(new Request("http://localhost/api/people/matches?lookingForTeam=true"));
  assert.equal(response.status, 200);
  const matches = await response.json() as { id: string; matchPct: number; complementarySkills: unknown[] }[];
  assert.ok(matches.every((match) => match.id && match.matchPct >= 25 && match.matchPct <= 100 && match.complementarySkills.length > 0));
});

test("research fallback ranks evidence from interests, skills, openings and lead availability", async () => {
  const matches = await researchMatches({ interests: DEMO_PROFILE.interests, skills: DEMO_PROFILE.skills.map(({ skill, proficiency, source }) => ({ ...skill, proficiency, source })) });
  assert.ok(matches.length >= 2);
  assert.ok(matches.every((match) => match.matchPct >= 0 && match.matchPct <= 100 && match.why.length > 0));
});

test("quest completion fallback is idempotent and never awards XP twice", async () => {
  const id = "q_docker_l1";
  for (const step of skillPathQuests().find((quest) => quest.id === id)!.steps) {
    await verifyQuestStep(request, "stu_completion_test", id, step.id, "https://github.com/example/docker-path");
  }
  const first = await completeQuest(request, "stu_completion_test", id);
  const second = await completeQuest(request, "stu_completion_test", id);
  assert.deepEqual(second, first);
  assert.equal(first.xp, DEMO_PROFILE.xp + first.xpAwarded);
});

test("the collaboration quest remains manually completable", async () => {
  const result = await completeQuest(request, "stu_team_completion_test", "q_team");
  assert.equal(result.questId, "q_team");
  assert.equal(result.xpAwarded, 80);
});

test("market goal aliases and specialist paths are complete", () => {
  assert.equal(resolveRoleFamily("AI Engineer"), "ML Engineer");
  assert.equal(resolveRoleFamily("Cybersecurity Engineer"), "DevOps Engineer");
  const specialistIds = ["llmapps", "rag", "aievals", "mlops", "kubernetes", "terraform", "cicd", "observability", "appsec", "testautomation", "dbt", "dataviz"];
  for (const id of specialistIds) {
    const path = skillPathQuests().filter((quest) => quest.pathSkillId === id);
    assert.equal(path.length, 3);
    assert.ok(path.every((quest) => quest.steps.length >= 5 && quest.steps.length <= 7));
    assert.equal(path[2]?.rarity, "legendary");
    assert.equal(path[2]?.skillsGained[0]?.id, id);
  }
});

test("connection transitions and direct-message pagination enforce actor ownership", async () => {
  const connection = await createConnectionRequest(request, "requester-test", { peerId: "recipient-test", message: "Hello" });
  const accepted = await respondToConnectionRequest(request, "recipient-test", connection.id, "accepted");
  assert.equal(accepted.status, "accepted");
  const thread = await createThread(request, "chat-owner", { memberIds: ["chat-peer"], kind: "direct" });
  const first = await sendMessage(request, "chat-owner", thread.id, "one");
  await sendMessage(request, "chat-peer", thread.id, "two");
  const page = await listMessages(request, "chat-owner", thread.id, null, 1);
  assert.equal(page.items.length, 1);
  assert.equal(first.senderId, "chat-owner");
  await assert.rejects(() => listMessages(request, "not-a-member", thread.id, null, 10), /FORBIDDEN/);
});

test("chat fallback rejects access to an unknown thread", async () => {
  await assert.rejects(
    () => listMessages(new Request("http://local"), "missing-user", crypto.randomUUID(), null, 20),
    /NOT_FOUND/,
  );
  await assert.rejects(
    () => sendMessage(new Request("http://local"), "missing-user", crypto.randomUUID(), "hello"),
    /NOT_FOUND/,
  );
});

test("Time Machine fallback produces reproducible alignment and simulations", async () => {
  const alignment = await getAlignment(request, "stu_time_machine");
  const repeated = await getAlignment(request, "stu_time_machine");
  assert.deepEqual(repeated, alignment);
  const simulation = await simulateTimeMachine(request, "stu_time_machine", { skillIds: ["docker"] });
  assert.ok(simulation.toPct >= simulation.fromPct);
  assert.equal(simulation.addedSkills[0]?.id, "docker");
});

test("Genie client polls a completed response and parses SQL plus a result table", async () => {
  let polls = 0;
  const client = new GenieClient({
    host: "https://workspace.invalid", token: "token", spaceId: "space", pollIntervalMs: 0,
    fetch: (async (url) => {
      const target = String(url);
      if (target.endsWith("/start-conversation")) return Response.json({ conversation_id: "provider-conversation", message_id: "provider-message" });
      polls += 1;
      // Shape captured from a live Databricks response: `manifest` and
      // `result` are siblings under `statement_response`, and the rows live in
      // `result.data_array`.
      return Response.json({ status: polls === 1 ? "EXECUTING_QUERY" : "COMPLETED", attachments: [{ text: { content: "Docker is the next skill." } }, { query: { sql: "SELECT 1", statement_response: { manifest: { schema: { columns: [{ name: "skill" }] } }, result: { data_array: [["Docker"]] } } } }] });
    }) as typeof fetch,
  });
  const started = await client.startConversation("What should I learn?");
  const answer = await client.waitForCompletion(started.conversationId, started.messageId);
  assert.equal(answer.text, "Docker is the next skill.");
  assert.equal(answer.sql, "SELECT 1");
  assert.deepEqual(answer.table?.rows, [["Docker"]]);
});

test("Genie client fetches the query-result endpoint when the attachment has no inline rows", async () => {
  const client = new GenieClient({
    host: "https://workspace.invalid", token: "token", spaceId: "space", pollIntervalMs: 0,
    fetch: (async (url) => {
      const target = String(url);
      if (target.endsWith("/start-conversation")) return Response.json({ conversation_id: "c1", message_id: "m1" });
      // What Databricks really returns: metadata only, no data_array.
      if (target.endsWith("/query-result")) {
        return Response.json({ statement_response: { manifest: { schema: { columns: [{ name: "posting_year" }, { name: "job_posting_count" }] } }, result: { data_array: [["2022", "36"], ["2023", "36"]] } } });
      }
      return Response.json({ status: "COMPLETED", attachments: [{ attachment_id: "a1", query: { query: "SELECT posting_year, COUNT(*) FROM job_postings GROUP BY 1", query_result_metadata: { row_count: 2 } } }] });
    }) as typeof fetch,
  });
  const started = await client.startConversation("How many postings per year?");
  const answer = await client.waitForCompletion(started.conversationId, started.messageId);
  assert.deepEqual(answer.table?.columns, ["posting_year", "job_posting_count"]);
  assert.deepEqual(answer.table?.rows, [["2022", "36"], ["2023", "36"]]);
});

test("Genie fallback emits the P1 SSE lifecycle and deduplicates an identical question", async () => {
  const first = [] as Awaited<ReturnType<typeof collectGenie>>;
  for await (const event of runGenie({ request, userId: "stu_genie", question: "What should I learn next?" })) first.push(event);
  const second = await collectGenie("What should I learn next?");
  assert.ok(first.some((event) => event.type === "sql"));
  assert.ok(first.some((event) => event.type === "table"));
  assert.equal(first.at(-1)?.type, "done");
  assert.deepEqual(second.at(-1), first.at(-1));
});

async function collectGenie(question: string) {
  const events = [] as import("@campusquest/shared").GenieStreamEvent[];
  for await (const event of runGenie({ request, userId: "stu_genie", question })) events.push(event);
  return events;
}

/* ------------------------------------------------------------- résumé -- */

test("résumé matching resolves aliases to canonical ids and never invents one", () => {
  const matched = matchSkills("Built REST APIs in Node.js and Next.js, deployed on K8s with CI/CD. Strong in C++ and DSA.");
  const ids = matched.map((match) => match.skillId);
  for (const expected of ["cpp", "node", "nextjs", "kubernetes", "cicd", "rest", "dsa"]) {
    assert.ok(ids.includes(expected as (typeof ids)[number]), `expected ${expected}, got ${ids.join(",")}`);
  }
  // Every id must be a real taxonomy key, since gaps and quests join on it.
  for (const id of ids) assert.ok(ALL_SKILLS.some((skill) => skill.id === id));
  assert.deepEqual(matched, matchSkills("Built REST APIs in Node.js and Next.js, deployed on K8s with CI/CD. Strong in C++ and DSA."));
});

test("résumé matching respects word boundaries and empty input", () => {
  // "go" inside "Google", "ts" inside "artifacts", "spring" inside "Springfield".
  const ids = matchSkills("Interned at Google in Springfield, shipping build artifacts.").map((m) => m.skillId);
  assert.ok(!ids.includes("go"));
  assert.ok(!ids.includes("typescript"));
  assert.ok(!ids.includes("springboot"));
  assert.deepEqual(matchSkills(""), []);
  assert.deepEqual(matchSkills("   "), []);
});

test("a résumé PDF's text is extracted and a non-PDF is rejected", () => {
  assert.equal(looksLikePdf(new TextEncoder().encode("not a pdf")), false);
  assert.equal(looksLikePdf(pdfWithText("Python")), true);
  // A PDF carrying no text stream reads as empty rather than throwing, which
  // is how the route tells a scanned résumé apart from an unreadable one.
  assert.equal(extractPdfText(new TextEncoder().encode("%PDF-1.4\n%%EOF\n")), "");

  const text = extractPdfText(pdfWithText("Skills: Python, PyTorch, Docker"));
  assert.match(text, /Python/);
  assert.deepEqual(
    matchSkills(text).map((match) => match.skillId).sort(),
    ["docker", "python", "pytorch"],
  );
});

/** Builds a minimal uncompressed PDF whose content stream shows `body`. */
function pdfWithText(body: string): Uint8Array {
  const stream = `BT /F1 12 Tf 72 720 Td (${body.replace(/([()\\])/g, "\\$1")}) Tj ET`;
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< >>\n%%EOF\n`,
  );
}

test("résumé profile fields resolve onto the onboarding vocabularies", () => {
  // The text a real "Jake's Resume" PDF extracts to: one run, contact details
  // on the name line, and a study range written with month names.
  const resume = "Shivansh Bhageria +91 9462000063 | mail@example.com | github.com/Shivansh1205 Education Bangalore Institute of Technology Bengaluru, India Bachelor of Technology in Computer Science and Engineering; CGPA: 8.02 Aug 2023 -- Jun 2027";
  const now = new Date("2026-09-02");
  assert.deepEqual(extractProfileFields(resume, now), { name: "Shivansh Bhageria", branch: "Computer Science", year: 4 });

  // Branch must be one onboarding actually offers, never raw résumé wording.
  assert.ok(BRANCHES.includes(extractBranch("B.E. in ECE") as (typeof BRANCHES)[number]));
  assert.equal(extractBranch("Bachelor of Arts in History"), null);

  // An explicit statement wins over date arithmetic.
  assert.equal(extractYear("Third-year student, expected graduation 2029", now), 3);
  assert.equal(extractYear("Class of 2027", now), 4);
  // Already graduated: better to leave it blank than to guess.
  assert.equal(extractYear("B.Tech 2018 - 2022", now), null);
  assert.equal(extractYear("no dates here", now), null);
});

test("résumé name extraction refuses anything that is not clearly a name", () => {
  assert.equal(extractName("CURRICULUM VITAE"), null);
  assert.equal(extractName("john"), null);
  assert.equal(extractName(""), null);
  // A heading that is not a person's name must not be adopted as one.
  assert.equal(extractName("Software Engineer Resume"), "Software Engineer");
});

test("a TeX-produced résumé recovers word breaks from TJ kerning", () => {
  // pdfLaTeX — what most student résumés are built with — emits no space
  // characters at all: words are split across TJ array elements and the only
  // evidence of a break is the kern between them. A small kern tightens a
  // letter pair inside one word, a large one is a space.
  const stream = "BT /F45 24 Tf [(Shiv)75(ansh)-250(Bha)45(geria)]TJ [(Bachelor)-250(of)-250(T)80(echnology)]TJ ET";
  const text = extractPdfText(uncompressedPdf(stream));
  assert.match(text, /Shivansh Bhageria/);
  assert.match(text, /Bachelor of Technology/);
  // The intra-word kerns must NOT become spaces.
  assert.doesNotMatch(text, /Shiv ansh|Bha geria|T echnology/);
});

/** Wraps an already-built content stream in a minimal PDF container. */
function uncompressedPdf(stream: string): Uint8Array {
  return new TextEncoder().encode(
    `%PDF-1.4\n1 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\ntrailer\n<< >>\n%%EOF\n`,
  );
}

test("the Databricks skill resolver never trusts an unverified answer", () => {
  const resume = "Orchestrated containers across a cluster with automated rollouts.";
  // A quote that really is in the résumé is accepted.
  assert.deepEqual(
    parseSkillIds('[{"id":"kubernetes","quote":"Orchestrated containers across a cluster"}]', resume),
    ["kubernetes"],
  );
  // An id outside the catalogue is dropped, so the user_skills foreign key
  // can never be violated by a hallucination.
  assert.deepEqual(parseSkillIds('[{"id":"not_a_skill","quote":"Orchestrated containers"}]', resume), []);
  // A fabricated quote is dropped even when the id is real — this is what
  // stops the model listing plausible-sounding skills it did not find.
  assert.deepEqual(parseSkillIds('[{"id":"kafka","quote":"streamed events through Kafka"}]', resume), []);
  // A missing quote is not evidence either.
  assert.deepEqual(parseSkillIds('[{"id":"kubernetes"}]', resume), []);
  assert.deepEqual(parseSkillIds("not json at all", resume), []);

  // A reasoning model returns its working as message parts, and the answer is
  // the last array in it.
  const reasoning = [{ type: "reasoning", summary: [{ type: "summary_text", text: "mongodb: no. kafka: no." }] }, { type: "text", text: '[{"id":"kubernetes","quote":"Orchestrated containers across a cluster"}]' }];
  assert.deepEqual(parseSkillIds(messageText(reasoning), resume), ["kubernetes"]);
});

test("skill deduplication only accepts verdicts the catalogue can honour", () => {
  const candidates = ["Retrieval Augmented Generation", "Rust", "Ghost Skill"];
  // A duplicate must name a real catalogue id; a new skill a real category.
  assert.deepEqual(
    parseVerdicts('[{"candidate":"Retrieval Augmented Generation","duplicateOf":"rag"}]', candidates),
    [{ kind: "duplicate", of: "rag", candidate: "Retrieval Augmented Generation" }],
  );
  assert.deepEqual(
    parseVerdicts('[{"candidate":"Rust","duplicateOf":null,"category":"language"}]', candidates),
    [{ kind: "new", candidate: "Rust", name: "Rust", category: "language" }],
  );
  // An id that is not in the catalogue cannot be merged into — that would
  // write a dangling reference.
  assert.deepEqual(parseVerdicts('[{"candidate":"Rust","duplicateOf":"not_a_skill"}]', candidates), []);
  // A new skill with no usable category has nothing sensible to insert.
  assert.deepEqual(parseVerdicts('[{"candidate":"Rust","duplicateOf":null,"category":"nonsense"}]', candidates), []);
  // A verdict about something nobody asked about is ignored.
  assert.deepEqual(parseVerdicts('[{"candidate":"Fabricated","duplicateOf":"rag"}]', candidates), []);
  // The same candidate is decided once, not twice.
  assert.equal(
    parseVerdicts('[{"candidate":"Rust","duplicateOf":null,"category":"language"},{"candidate":"Rust","duplicateOf":"go"}]', candidates).length,
    1,
  );
  // "skip" is neither merged nor added: a hosting platform is not a skill.
  assert.deepEqual(parseVerdicts('[{"candidate":"Rust","duplicateOf":"skip"}]', candidates), []);
  assert.deepEqual(parseVerdicts("not json", candidates), []);
});

test("candidate names are parsed from the skills section, not invented", () => {
  const resume = "Technical Skills Languages : Python, Java, Rust Tools/Platforms : Git, Qdrant, Vercel Achievements ICPC 2025 : Regionalist";
  // Skills the matcher already found are not candidates; the rest are.
  const candidates = extractSkillCandidates(resume, ["python", "Python", "java", "Java", "git", "Git"]);
  assert.ok(candidates.includes("Rust"), candidates.join(","));
  assert.ok(candidates.includes("Qdrant"));
  assert.ok(!candidates.some((name) => name.toLowerCase() === "python"));
  // Section labels are not technologies.
  assert.ok(!candidates.some((name) => /^(languages|tools|skills)$/i.test(name)));
  // A résumé with no skills section yields nothing rather than guessing.
  assert.deepEqual(extractSkillCandidates("Worked at a company doing things.", []), []);
});

test("ATS scoring clamps every number to the rubric's ceilings", () => {
  // A model that exceeds a category ceiling must not produce a score no
  // student could reach; the totals are what the UI draws bars from.
  const reply = JSON.stringify({
    scores: {
      open_source: { score: 99, evidence: "contributed to Phoenix" },
      self_projects: { score: 22, evidence: "RAG abstention layer" },
      production: { score: 18, evidence: "Airtel internship" },
      technical_skills: { score: 8, evidence: "Python, PyTorch" },
    },
    bonus_points: { total: 50, breakdown: "LinkedIn" },
    deductions: { total: -4, reasons: "no links" },
    key_strengths: ["a", "b", "c", "d", "e", "f", "g"],
    areas_for_improvement: [{ title: "Add demo links", detail: "", category: "self_projects", points: 3 }],
  });
  const score = parseEvaluation(reply)!;
  assert.equal(score.categories.openSource.score, 35, "open source capped at 35");
  assert.equal(score.bonus.total, 20, "bonus capped at 20");
  // A negative deduction total is still a deduction, not a bonus.
  assert.equal(score.deductions.total, 4);
  assert.equal(score.overall, 35 + 22 + 18 + 8 + 20 - 4);
  assert.equal(score.strengths.length, 5, "at most five strengths");

  // An unusable reply yields null rather than a fabricated score.
  assert.equal(parseEvaluation("no json here"), null);
  assert.equal(parseEvaluation('{"unrelated": true}'), null);
});

test("extracted text carries no control characters", () => {
  // Font tables inside a PDF decode to control characters — a real résumé
  // yields thousands, including NUL. Postgres rejects NUL in a text column
  // outright, so leaving them in made storing a résumé fail silently.
  const stream = "BT (Hello) Tj (\\000World) Tj ET";
  const text = extractPdfText(uncompressedPdf(stream));
  assert.ok(!/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(text), JSON.stringify(text));
  assert.match(text, /Hello/);
});
