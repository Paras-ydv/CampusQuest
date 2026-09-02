import type { CompleteQuestResult, Quest, Skill, VerifyQuestStepResult } from "@campusquest/shared";
import { DEMO_QUESTS } from "@/lib/data/fixtures";
import { SKILL_PATH_GOALS, skillPathQuests } from "@/lib/skill-paths";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { getSkillGapContext, type SkillGapContext } from "@/lib/skill-gaps";
import { resolveRoleFamily } from "@/lib/data/role-families";
import { invalidateUser } from "@/lib/data/warehouse-cache";
import { warehouseCoveragePct } from "@/lib/timemachine";
import { createRequestSupabaseClient, localFallbackEnabled, supabaseForCaller } from "@/lib/supabase/server";

type QuestRecord = Quest & { difficulty: "intro" | "intermediate" | "advanced"; goalRoles: string[] };
const fallbackCompletions = new Map<string, CompleteQuestResult>();
const fallbackVerifications = new Map<string, VerifyQuestStepResult>();

const difficultyOrder = { intro: 0, intermediate: 1, advanced: 2 } as const;
function normalize(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]/g, ""); }

export function rankQuests(quests: QuestRecord[], profile: Pick<BackendProfile, "year" | "goalRole">, gaps: SkillGapContext): QuestRecord[] {
  const targetDifficulty = profile.year <= 2 ? "intro" : profile.year === 3 ? "intermediate" : "advanced";
  const highestImpact = Math.max(1, ...gaps.gaps.map((gap) => gap.impactPct));
  const impactBySkill = new Map(gaps.gaps.map((gap) => [gap.skillId, gap.impactPct / highestImpact]));
  return [...quests].sort((left, right) => {
    const score = (quest: QuestRecord) => {
      const gap = Math.max(0, ...quest.skillsGained.map((skill) => impactBySkill.get(skill.id) ?? 0));
      const target = resolveRoleFamily(profile.goalRole);
      const goal = quest.goalRoles.some((role) => resolveRoleFamily(role) === target) ? 1 : 0.5;
      const distance = Math.abs(difficultyOrder[quest.difficulty] - difficultyOrder[targetDifficulty]);
      const difficulty = distance === 0 ? 1 : distance === 1 ? 0.6 : 0.2;
      return gap * 0.6 + goal * 0.25 + difficulty * 0.15;
    };
    const scoreDelta = score(right) - score(left);
    return scoreDelta || left.estimatedHours - right.estimatedHours || left.id.localeCompare(right.id);
  });
}

function demoQuestRecords(userId: string): QuestRecord[] {
  const completed = new Set([...fallbackCompletions.entries()].filter(([key]) => key.startsWith(`${userId}:`)).map(([, result]) => result.questId));
  const technical = skillPathQuests().filter((quest) => !quest.prerequisiteQuestId || completed.has(quest.prerequisiteQuestId));
  const team = DEMO_QUESTS.find((quest) => quest.id === "q_team");
  return [...technical, ...(team ? [team] : [])].map((quest) => ({
    ...quest,
    status: completed.has(quest.id) ? "completed" : quest.status,
    steps: quest.steps.map((step) => {
      const verified = fallbackVerifications.get(`${userId}:${quest.id}:${step.id}`);
      return verified?.passed ? { ...step, done: true, verifiedCommit: verified.commit, verifiedAt: new Date().toISOString(), verificationMessage: verified.message } : step;
    }),
    difficulty: quest.pathLevel === 1 ? "intro" : quest.pathLevel === 3 ? "advanced" : "intermediate",
    goalRoles: quest.pathSkillId ? (SKILL_PATH_GOALS[quest.pathSkillId] ?? []) : ["AI/ML Engineer", "Backend Engineer", "Data Engineer", "Product Engineer"],
  }));
}

function toQuestRecord(row: Record<string, unknown>): QuestRecord {
  const progress = ((row.user_quests ?? []) as { status: Quest["status"]; repository_url?: string | null; user_quest_steps?: { quest_step_id: string; verified_at: string | null; verified_commit: string | null; verification_message: string | null }[] }[])[0];
  const verified = new Map((progress?.user_quest_steps ?? []).map((step) => [step.quest_step_id, step]));
  const technical = String(row.id) !== "q_team";
  const steps = ((row.quest_steps ?? []) as { id: string; label: string; sort_order: number; verification_type?: "github_file" | "github_workflow" | "manual" }[]).sort((a, b) => a.sort_order - b.sort_order).map((step) => {
    const result = verified.get(step.id);
    return { id: step.id, label: step.label, done: Boolean(result?.verified_at), verification: technical ? (step.verification_type ?? "github_file") : "manual", verifiedAt: result?.verified_at ?? null, verifiedCommit: result?.verified_commit ?? null, verificationMessage: result?.verification_message ?? null };
  });
  const skillsGained = ((row.quest_skills ?? []) as { skills?: Skill | null }[]).flatMap((entry) => entry.skills ? [entry.skills] : []);
  return {
    id: String(row.id), title: String(row.title), summary: String(row.summary), category: row.category as Quest["category"], rarity: row.rarity as Quest["rarity"], xp: Number(row.xp),
    skillsGained, steps, estimatedHours: Number(row.estimated_hours), why: String(row.why_template ?? "This quest advances a deterministic skill gap."), status: progress?.status ?? "available",
    difficulty: row.difficulty as QuestRecord["difficulty"], goalRoles: (row.goal_roles as string[]) ?? [], repositoryUrl: progress?.repository_url ?? null,
    pathSkillId: row.path_skill_id ? String(row.path_skill_id) : null,
    pathLevel: row.path_level ? Number(row.path_level) : null,
    prerequisiteQuestId: row.prerequisite_quest_id ? String(row.prerequisite_quest_id) : null,
  };
}

export async function getQuestRecords(request: Request | undefined, userId: string): Promise<QuestRecord[]> {
  const supabase = await supabaseForCaller(request);
  if (!supabase) return localFallbackEnabled() ? demoQuestRecords(userId) : Promise.reject(new Error("SUPABASE_NOT_CONFIGURED"));
  const { data, error } = await supabase.from("quests").select("*, quest_steps(*), quest_skills(skills(*)), user_quests(status, repository_url, user_quest_steps(quest_step_id, verified_at, verified_commit, verification_message))");
  if (error) throw new Error(`Could not load quests: ${error.message}`);
  const records = ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((row) => row.is_retired !== true)
    .map(toQuestRecord);
  const completed = new Set(records.filter((quest) => quest.status === "completed").map((quest) => quest.id));
  return records.filter((quest) => !quest.prerequisiteQuestId || completed.has(quest.prerequisiteQuestId));
}

export async function listQuests(request: Request | undefined, userId: string): Promise<Quest[]> {
  return (await getQuestRecords(request, userId)).map(({ difficulty: _difficulty, goalRoles: _goalRoles, ...quest }) => quest);
}

export async function nextQuest(request: Request | undefined, userId: string): Promise<Quest> {
  const [profile, quests] = await Promise.all([getBackendProfile(request, userId), getQuestRecords(request, userId)]);
  const gaps = await getSkillGapContext(profile);
  const next = rankQuests(quests.filter((quest) => quest.status !== "completed"), profile, gaps)[0];
  if (!next) throw new Error("NOT_FOUND");
  const { difficulty: _difficulty, goalRoles: _goalRoles, ...quest } = next;
  return quest;
}

async function notifyProfileSync(userId: string, questId: string): Promise<void> {
  const webhook = process.env.PROFILE_SYNC_WEBHOOK_URL;
  if (!webhook) return;
  try {
    await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.PROFILE_SYNC_WEBHOOK_SECRET ? { "X-CampusQuest-Sync-Secret": process.env.PROFILE_SYNC_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify({ userId, event: "quest_completed", questId }),
    });
  } catch { /* durable activity is already committed */ }
}

export async function completeQuest(request: Request | undefined, userId: string, questId: string): Promise<CompleteQuestResult> {
  const [profile, quests] = await Promise.all([getBackendProfile(request, userId), getQuestRecords(request, userId)]);
  const quest = quests.find((item) => item.id === questId);
  if (!quest) throw new Error("NOT_FOUND");
  const requiresVerification = Boolean(quest.pathSkillId) || quest.steps.some((step) => step.verification === "github_file" || step.verification === "github_workflow");
  if (requiresVerification && quest.steps.some((step) => !step.done)) throw new Error("QUEST_STEPS_NOT_VERIFIED");
  const gapsBefore = await getSkillGapContext(profile);
  const relevance = Math.max(0, ...quest.skillsGained.map((skill) => gapsBefore.gaps.find((gap) => gap.skillId === skill.id)?.impactPct ?? 0));
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const key = `${userId}:${questId}`;
    const previous = fallbackCompletions.get(key);
    if (previous) return previous;
    const xp = profile.xp + quest.xp;
    const level = Math.floor(xp / 350) + 1;
    const result: CompleteQuestResult = { questId, xpAwarded: quest.xp, xp, level, leveledUp: level > profile.level, skillsGained: quest.skillsGained, alignmentBeforePct: gapsBefore.alignmentPct, alignmentAfterPct: Math.min(100, gapsBefore.alignmentPct + relevance), completedAt: new Date().toISOString() };
    fallbackCompletions.set(key, result);
    // The student's skills just changed, so alignment, gaps, the recommended
  // quest and the opportunity ranking are all stale.
  invalidateUser(userId);
  await notifyProfileSync(userId, questId);
    return result;
  }
  const { data, error } = await supabase.rpc("complete_quest", { p_quest_id: questId });
  if (error || !data?.[0]) throw new Error(`Could not complete quest: ${error?.message ?? "no result"}`);
  const row = data[0];
  // Recomputed with the quest's skills now held, so the "alignment after"
  // figure reflects the completion rather than an optimistic guess.
  const profileAfter = {
    ...profile,
    skills: [...profile.skills, ...quest.skillsGained.map((earned) => ({ id: earned.id, name: earned.name, category: earned.category }))],
    wantsToLearn: profile.wantsToLearn.filter((skill) => !quest.skillsGained.some((earned) => earned.id === skill)),
  };
  // Measure both sides rather than projecting the second from the first.
  const [measuredBefore, measuredAfter] = await Promise.all([
    warehouseCoveragePct(profile).catch(() => null),
    warehouseCoveragePct(profileAfter).catch(() => null),
  ]);
  const gapsAfter = await getSkillGapContext(
    profileAfter,
    measuredAfter ?? Math.min(100, gapsBefore.alignmentPct + relevance),
  );
  const result: CompleteQuestResult = { questId, xpAwarded: row.xp_awarded, xp: row.xp, level: row.level, leveledUp: row.leveled_up, skillsGained: quest.skillsGained, alignmentBeforePct: measuredBefore ?? gapsBefore.alignmentPct, alignmentAfterPct: measuredAfter ?? gapsAfter.alignmentPct, completedAt: row.completed_at };
  // The student's skills just changed, so alignment, gaps, the recommended
  // quest and the opportunity ranking are all stale.
  invalidateUser(userId);
  await notifyProfileSync(userId, questId);
  return result;
}

export async function verifyQuestStep(request: Request | undefined, userId: string, questId: string, stepId: string, repositoryUrl?: string): Promise<VerifyQuestStepResult> {
  const quest = (await getQuestRecords(request, userId)).find((item) => item.id === questId);
  const step = quest?.steps.find((item) => item.id === stepId);
  if (!quest || !step) throw new Error("NOT_FOUND");
  const repoUrl = repositoryUrl ?? quest.repositoryUrl;
  if (!repoUrl) throw new Error("REPOSITORY_REQUIRED");
  const url = new URL(repoUrl); const [owner, repo] = url.pathname.split("/").filter(Boolean);
  if (url.protocol !== "https:" || url.hostname !== "github.com" || !owner || !repo) throw new Error("INVALID_GITHUB_REPOSITORY");
  const supabase = await supabaseForCaller(request);
  if (!supabase) {
    const result = { questId, stepId, passed: true, message: "Verified in local demo mode.", commit: "local-demo" };
    fallbackVerifications.set(`${userId}:${questId}:${stepId}`, result);
    return result;
  }
  const headers = { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };
  const detailsResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/, ""))}`, { headers });
  if (!detailsResponse.ok) throw new Error(detailsResponse.status === 404 ? "REPOSITORY_NOT_FOUND_OR_PRIVATE" : "GITHUB_UNAVAILABLE");
  const details = await detailsResponse.json() as { default_branch: string };
  const treeResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/, ""))}/git/trees/${encodeURIComponent(details.default_branch)}?recursive=1`, { headers });
  if (!treeResponse.ok) throw new Error("GITHUB_UNAVAILABLE");
  const tree = await treeResponse.json() as { sha: string; tree: { path: string }[] };
  const paths = tree.tree.map((entry) => entry.path.toLowerCase());
  let passed = paths.includes("readme.md") && paths.some((path) => /\.(py|js|ts|java|sql|ipynb)$/.test(path));
  let message = passed ? `Verified against commit ${tree.sha.slice(0, 7)}.` : "Add the required repository artifact and try again.";
  if (step.verification === "github_workflow") {
    if (!paths.some((path) => path.startsWith(".github/workflows/"))) {
      passed = false;
      message = "Add a GitHub Actions workflow and try again.";
    } else {
      const runsResponse = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo.replace(/\.git$/, ""))}/actions/runs?head_sha=${encodeURIComponent(tree.sha)}&per_page=20`, { headers });
      if (!runsResponse.ok) throw new Error("GITHUB_UNAVAILABLE");
      const runs = await runsResponse.json() as { workflow_runs?: { id: number; status: string; conclusion: string | null; html_url: string }[] };
      const successfulRun = runs.workflow_runs?.find((run) => run.status === "completed" && run.conclusion === "success");
      passed = Boolean(successfulRun);
      message = successfulRun ? `Verified successful GitHub Actions run for commit ${tree.sha.slice(0, 7)}.` : "A successful GitHub Actions run is required for this commit.";
    }
  }
  await (supabase as any).rpc("verify_quest_step", { p_quest_id: questId, p_step_id: stepId, p_repository_url: repoUrl, p_passed: passed, p_commit: tree.sha, p_message: message });
  return { questId, stepId, passed, message, commit: tree.sha };
}
