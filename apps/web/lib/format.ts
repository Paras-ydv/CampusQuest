/** Whole days from now until an ISO timestamp. Negative once it has passed. */
export function daysUntil(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  return Math.ceil((then - now.getTime()) / 86_400_000);
}

/**
 * Short deadline label for cards. Returns null for rolling opportunities so the
 * caller can omit the row entirely rather than printing "no deadline".
 */
export function deadlineLabel(
  iso: string | null,
  now: Date = new Date(),
): { text: string; urgent: boolean } | null {
  if (!iso) return { text: "Rolling", urgent: false };

  const days = daysUntil(iso, now);
  if (days < 0) return { text: "Closed", urgent: false };
  if (days === 0) return { text: "Today", urgent: true };
  if (days === 1) return { text: "1 day left", urgent: true };
  return { text: `${days} days left`, urgent: days <= 7 };
}

export function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
