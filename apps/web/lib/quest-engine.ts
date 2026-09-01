import type { CompleteQuestResult, Quest, Skill } from "@campusquest/shared";
import { DEMO_QUESTS } from "@/lib/data/fixtures";
import { getBackendProfile, type BackendProfile } from "@/lib/backend/profile";
import { getSkillGapContext, type SkillGapContext } from "@/lib/skill-gaps";
import { resolveRoleFamily } from "@/lib/data/role-families";
import { warehouseCoveragePct } from "@/lib/timemachine";
import { createRequestSupabaseClient, localFallbackEnabled } from "@/lib/supabase/server";

type QuestRecord = Quest & { difficulty: "intro" | "intermediate" | "advanced"; goalRoles: string[] };
const fallbackCompletions = new Map<string, CompleteQuestResult>();

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

function demoQuestRecords(): QuestRecord[] {
  return DEMO_QUESTS.map((quest) => ({ ...quest, difficulty: quest.id === "q_sql" ? "intro" : quest.id === "q_oss" ? "advanced" : "intermediate", goalRoles: quest.id === "q_docker" ? ["AI/ML Engineer", "Backend Engineer", "Platform Engineer"] : quest.id === "q_sysdesign" ? ["Backend Engineer", "AI/ML Engineer"] : quest.id === "q_oss" ? ["AI/ML Engineer"] : quest.id === "q_sql" ? ["Backend Engineer", "Data Engineer"] : ["Product Engineer", "AI/ML Engineer"] }));
}

function toQuestRecord(row: Record<string, unknown>): QuestRecord {
  const steps = ((row.quest_steps ?? []) as { id: string; label: string; sort_order: number }[]).sort((a, b) => a.sort_order - b.sort_order).map((step) => ({ id: step.id, label: step.label, done: false }));
  const skillsGained = ((row.quest_skills ?? []) as { skills?: Skill | null }[]).flatMap((entry) => entry.skills ? [entry.skills] : []);
  const progress = ((row.user_quests ?? []) as { status: Quest["status"] }[])[0];
  return {
    id: String(row.id), title: String(row.title), summary: String(row.summary), category: row.category as Quest["category"], rarity: row.rarity as Quest["rarity"], xp: Number(row.xp),
    skillsGained, steps, estimatedHours: Number(row.estimated_hours), why: String(row.why_template ?? "This quest advances a deterministic skill gap."), status: progress?.status ?? "available",
    difficulty: row.difficulty as QuestRecord["difficulty"], goalRoles: (row.goal_roles as string[]) ?? [],
  };
}

export async function getQuestRecords(request: Request, userId: string): Promise<QuestRecord[]> {
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) return localFallbackEnabled() ? demoQuestRecords() : Promise.reject(new Error("SUPABASE_NOT_CONFIGURED"));
  const { data, error } = await supabase.from("quests").select("*, quest_steps(*), quest_skills(skills(*)), user_quests(status)");
  if (error) throw new Error(`Could not load quests: ${error.message}`);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toQuestRecord);
}

export async function listQuests(request: Request, userId: string): Promise<Quest[]> {
  return (await getQuestRecords(request, userId)).map(({ difficulty: _difficulty, goalRoles: _goalRoles, ...quest }) => quest);
}

export async function nextQuest(request: Request, userId: string): Promise<Quest> {
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

export async function completeQuest(request: Request, userId: string, questId: string): Promise<CompleteQuestResult> {
  const [profile, quests] = await Promise.all([getBackendProfile(request, userId), getQuestRecords(request, userId)]);
  const quest = quests.find((item) => item.id === questId);
  if (!quest) throw new Error("NOT_FOUND");
  const gapsBefore = await getSkillGapContext(profile);
  const relevance = Math.max(0, ...quest.skillsGained.map((skill) => gapsBefore.gaps.find((gap) => gap.skillId === skill.id)?.impactPct ?? 0));
  const supabase = createRequestSupabaseClient(request);
  if (!supabase) {
    if (!localFallbackEnabled()) throw new Error("SUPABASE_NOT_CONFIGURED");
    const key = `${userId}:${questId}`;
    const previous = fallbackCompletions.get(key);
    if (previous) return previous;
    const xp = profile.xp + quest.xp;
    const level = Math.floor(xp / 350) + 1;
    const result: CompleteQuestResult = { questId, xpAwarded: quest.xp, xp, level, leveledUp: level > profile.level, skillsGained: quest.skillsGained, alignmentBeforePct: gapsBefore.alignmentPct, alignmentAfterPct: Math.min(100, gapsBefore.alignmentPct + relevance), completedAt: new Date().toISOString() };
    fallbackCompletions.set(key, result);
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
  await notifyProfileSync(userId, questId);
  return result;
}
