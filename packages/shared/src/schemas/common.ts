import { z } from "zod";

/**
 * ISO-8601 timestamp, e.g. "2026-08-31T09:00:00.000Z".
 * Kept as a plain string so the contract does not depend on a
 * zod-version-specific date API.
 */
export const IsoDate = z.string().min(1);

export const Id = z.string().min(1);

/** Percentage 0-100, not 0-1. Every `*Pct` field in this package uses it. */
export const Percent = z.number().min(0).max(100);

export const ApiError = z.object({
  error: z.string(),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().nonnegative(),
    cursor: z.string().nullable().default(null),
  });
}
