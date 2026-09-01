import assert from "node:assert/strict";
import test from "node:test";
import { DEMO_PROFILE, DEMO_QUESTS } from "../lib/data/fixtures";
import { deterministicEmbedding, EMBEDDING_DIMENSIONS, getOrCreateProfileEmbedding, validateEmbedding } from "../lib/embeddings";
import { rankQuests, completeQuest } from "../lib/quest-engine";
import { peopleMatches } from "../lib/people-matchmaker";
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

test("malformed provider vectors fail closed and Genie rationale failure preserves results", async () => {
  const saved = { host: process.env.DATABRICKS_HOST, token: process.env.DATABRICKS_TOKEN, endpoint: process.env.DATABRICKS_EMBEDDING_ENDPOINT, rerank: process.env.P2_GENIE_RATIONALE_URL, fetch: globalThis.fetch };
  process.env.DATABRICKS_HOST = "https://example.invalid";
  process.env.DATABRICKS_TOKEN = "test-token";
  process.env.DATABRICKS_EMBEDDING_ENDPOINT = "embeddings";
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: [{ embedding: [0] }] }), { status: 200 })) as typeof fetch;
  await assert.rejects(() => getOrCreateProfileEmbedding({ userId: "malformed-provider", goalRole: "Engineer", interests: [], skills: [], projects: [] }), /invalid 1024/);
  process.env.DATABRICKS_HOST = saved.host;
  process.env.DATABRICKS_TOKEN = saved.token;
  process.env.DATABRICKS_EMBEDDING_ENDPOINT = saved.endpoint;
  process.env.P2_GENIE_RATIONALE_URL = "https://example.invalid/rerank";
  globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as typeof fetch;
  const failedRerank = await peopleMatches(request, "stu_001", {});
  delete process.env.P2_GENIE_RATIONALE_URL;
  globalThis.fetch = saved.fetch;
  assert.ok(failedRerank.length > 0);
});

test("people fallback filters and preserves deterministic ordering", async () => {
  const all = await peopleMatches(request, "stu_001", {});
  const robotics = await peopleMatches(request, "stu_001", { interest: "robotics" });
  assert.ok(all.length >= robotics.length);
  assert.ok(robotics.every((peer) => peer.sharedInterests.some((interest) => interest.toLowerCase().includes("robotics"))));
  assert.deepEqual((await peopleMatches(request, "stu_001", {})).map((peer) => peer.id), all.map((peer) => peer.id));
});

test("research fallback ranks evidence from interests, skills, openings and lead availability", async () => {
  const matches = await researchMatches({ interests: DEMO_PROFILE.interests, skills: DEMO_PROFILE.skills.map(({ skill }) => skill) });
  assert.ok(matches.length >= 2);
  assert.ok(matches.every((match) => match.matchPct >= 0 && match.matchPct <= 100 && match.why.length > 0));
});

test("quest completion fallback is idempotent and never awards XP twice", async () => {
  const id = "q_docker";
  const first = await completeQuest(request, "stu_completion_test", id);
  const second = await completeQuest(request, "stu_completion_test", id);
  assert.deepEqual(second, first);
  assert.equal(first.xp, DEMO_PROFILE.xp + first.xpAwarded);
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
