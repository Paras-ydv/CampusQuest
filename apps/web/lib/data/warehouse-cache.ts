/**
 * A small per-user, time-boxed memo for the expensive warehouse reads.
 *
 * Alignment, the opportunity ranking and the research traversal each cost a
 * round trip to Databricks — one to two seconds — and none of them changes
 * between one click of the nav and the next. Without this, moving between
 * screens re-runs every query from scratch, which is what made navigation feel
 * slow even after the reads moved in-process.
 *
 * Scope and lifetime are deliberately modest:
 *
 *  - Keyed by user id, so one student's results can never be served to another.
 *  - Short TTL, so a stale figure cannot survive long even if nothing
 *    invalidates it.
 *  - Explicitly invalidated when the student does something that changes the
 *    answer — completing a quest moves alignment, and seeing XP rise while
 *    alignment sits still would look broken.
 *
 * In-memory by design: it lives for the life of a server instance and simply
 * misses on a cold one. There is nothing here worth the complexity of a shared
 * cache, and nothing here that is correct to serve from one.
 */

type Entry = { value: unknown; expiresAt: number };

const TTL_MS = 60_000;
const store = new Map<string, Entry>();

/** Bumped per user on mutation, so old entries can never be read again. */
const versions = new Map<string, number>();

function versionOf(userId: string): number {
  return versions.get(userId) ?? 0;
}

/** Runs `load` at most once per user, key and TTL window. */
export async function cachedForUser<T>(userId: string, key: string, load: () => Promise<T>): Promise<T> {
  const cacheKey = `${userId}:${versionOf(userId)}:${key}`;
  const hit = store.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  const value = await load();
  store.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });

  // Opportunistic sweep: without it the map grows with every expired key.
  if (store.size > 500) {
    const now = Date.now();
    for (const [k, entry] of store) if (entry.expiresAt <= now) store.delete(k);
  }
  return value;
}

/**
 * Call after anything that changes what the warehouse reads would return for
 * this student: completing a quest, finishing onboarding, saving an
 * opportunity.
 */
export function invalidateUser(userId: string): void {
  versions.set(userId, versionOf(userId) + 1);
}
