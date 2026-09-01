/**
 * ===========================================================================
 *  ROLE FAMILY VOCABULARY
 * ===========================================================================
 * `job_roles.role_family` in Databricks is the only vocabulary the historical
 * analysis can answer for. A profile whose `goal_role` is not one of these
 * gets zero matching roles, which reads in the UI as "0% alignment, no gaps"
 * rather than as a configuration mistake.
 *
 * Onboarding therefore offers exactly these families, and `resolveRoleFamily`
 * maps everything else onto them — older profiles, seeded demo accounts, and
 * the friendlier titles P1 originally shipped. Mapping rather than rewriting
 * means existing rows keep working without a data migration.
 */

/** The eleven families present in `workspace.campusquest.job_roles`. */
export const ROLE_FAMILIES = [
  "Backend Engineer",
  "Software Engineer",
  "Frontend Engineer",
  "Data Engineer",
  "ML Engineer",
  "Data Analyst",
  "DevOps Engineer",
  "Mobile Engineer",
  "QA Engineer",
  "Embedded Engineer",
  "Product Engineer",
] as const;

export type RoleFamily = (typeof ROLE_FAMILIES)[number];

/**
 * Titles that appear in existing profiles but are not themselves families.
 * Each maps to the family whose historical postings best represent it.
 */
const ALIASES: Record<string, RoleFamily> = {
  "ai/ml engineer": "ML Engineer",
  "machine learning engineer": "ML Engineer",
  "computer vision engineer": "ML Engineer",
  "research scientist": "ML Engineer",
  "data scientist": "ML Engineer",
  "full-stack engineer": "Software Engineer",
  "fullstack engineer": "Software Engineer",
  "full stack engineer": "Software Engineer",
  "platform engineer": "DevOps Engineer",
  "platform / devops engineer": "DevOps Engineer",
  "site reliability engineer": "DevOps Engineer",
  "sre": "DevOps Engineer",
  "cloud engineer": "DevOps Engineer",
  "robotics engineer": "Embedded Engineer",
  "hardware engineer": "Embedded Engineer",
  "firmware engineer": "Embedded Engineer",
  "iot engineer": "Embedded Engineer",
  "android engineer": "Mobile Engineer",
  "ios engineer": "Mobile Engineer",
  "test engineer": "QA Engineer",
  "sdet": "QA Engineer",
  "business analyst": "Data Analyst",
  "analytics engineer": "Data Analyst",
  "ui engineer": "Frontend Engineer",
  "web developer": "Frontend Engineer",
};

const CANONICAL = new Map<string, RoleFamily>(
  ROLE_FAMILIES.map((family) => [family.toLowerCase(), family]),
);

/**
 * Resolves any goal-role string to a family the warehouse can answer for.
 * Falls back to Software Engineer, the broadest family, so an unrecognised
 * title still produces a real analysis rather than an empty screen.
 */
export function resolveRoleFamily(goalRole: string | null | undefined): RoleFamily {
  const key = (goalRole ?? "").trim().toLowerCase();
  if (!key) return "Software Engineer";
  const direct = CANONICAL.get(key);
  if (direct) return direct;
  const alias = ALIASES[key];
  if (alias) return alias;
  // Last resort: a family whose name is contained in the title, e.g.
  // "Senior Backend Engineer" → Backend Engineer.
  for (const family of ROLE_FAMILIES) {
    if (key.includes(family.toLowerCase())) return family;
  }
  return "Software Engineer";
}

/** True when the stored title is already a family, so the UI can say so. */
export function isCanonicalRoleFamily(goalRole: string): boolean {
  return CANONICAL.has(goalRole.trim().toLowerCase());
}
