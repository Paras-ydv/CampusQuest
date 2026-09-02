import { getAlignmentData, getProfile } from "@/lib/data/server";
import { TICKER_ITEMS } from "@/lib/data/fixtures";

/**
 * The line of figures running under the nav on every screen.
 *
 * It used to be a fixture — "Docker · 68% of surveyed backend roles", "MLOps ·
 * 38%" — shown to everyone regardless of what they were aiming at, sitting an
 * inch below the words "GOAL — FRONTEND ENGINEER". Every number here now comes
 * from the same weighted gap query the Time Machine and the quest board use,
 * so the heartbeat is the student's own.
 *
 * Reads go through the per-user cache the other screens already populate, so
 * on a normal navigation this costs nothing extra.
 */
export async function tickerItems(): Promise<string[]> {
  try {
    const [profile, alignment] = await Promise.all([getProfile(), getAlignmentData()]);
    const gaps = alignment.gaps.slice(0, 4).map(
      (gap) => `${gap.skill.name} · ${gap.impactPct}% of ${profile.goalRole} roles`,
    );

    const items = [
      `Alignment ${alignment.currentPct}% against ${alignment.roleCount} ${profile.goalRole} roles`,
      ...gaps,
      `Level ${profile.level} · ${profile.xp.toLocaleString()} XP`,
    ];
    const top = alignment.gaps[0];
    if (top) {
      items.push(`Closing ${top.skill.name} would take it to ${Math.min(100, alignment.currentPct + top.impactPct)}%`);
    }
    // A student with no gaps in their family is a real answer, not an error,
    // but a two-item marquee looks broken — so the fixture is the floor.
    return items.length >= 4 ? items : TICKER_ITEMS;
  } catch {
    // The shell must render even when the warehouse is unreachable.
    return TICKER_ITEMS;
  }
}
