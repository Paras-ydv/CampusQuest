/**
 * The choices offered wherever a profile is edited.
 *
 * Onboarding and the profile screen must agree: a student who picks "Mechanical"
 * at sign-up should see that same option when they come back to change it, and
 * a goal role has to be one the warehouse can answer for.
 */
export const BRANCHES = [
  "Computer Science",
  "Information Technology",
  "Electronics",
  "Electrical",
  "Mechanical",
  "Mathematics",
  "Civil",
  "Chemical",
] as const;

export const INTERESTS = [
  "Machine learning",
  "Distributed systems",
  "Robotics",
  "Computer vision",
  "Open source",
  "Web development",
  "Product design",
  "Data engineering",
  "Cybersecurity",
  "Embedded systems",
] as const;

export const ACADEMIC_YEARS = [1, 2, 3, 4, 5] as const;
