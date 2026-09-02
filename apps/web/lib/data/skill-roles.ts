import { GOAL_ROLE_CHOICES } from "./role-families";

/**
 * ===========================================================================
 *  SKILL → GOAL ROLES
 * ===========================================================================
 * Which goals a skill actually serves.
 *
 * The quest board is ranked and filtered on this. Before it existed, quests
 * carried an ad-hoc `goal_roles` array written per seed migration, only 25 of
 * the 59 skills had one at all, and nothing filtered on it — so a student
 * aiming at Frontend Engineer was offered PyTorch, Terraform and dbt in the
 * same order as everybody else. The list below is the single reviewed answer
 * to "would doing this move me towards that job?".
 *
 * Two rules kept it honest:
 *
 *   - A skill is listed against a role only if the role's day-to-day work uses
 *     it. React is not listed under Data Engineer to pad coverage.
 *   - Every one of `GOAL_ROLE_CHOICES` must appear on at least four skills, or
 *     that goal has no board worth showing. `npm run quests:check` fails the
 *     build if a goal drops below that.
 *
 * Goals are the labels students actually pick in onboarding, not the eleven
 * warehouse families: the two vocabularies differ (a "Cloud Engineer" resolves
 * to the DevOps Engineer family for analytics), and quests should follow what
 * the student said they want.
 */
export const SKILL_GOAL_ROLES: Readonly<Record<string, readonly string[]>> = {
  /* ------------------------------------------------------------ languages -- */
  python: ["ML Engineer", "AI Engineer", "Data Scientist", "Data Engineer", "Data Analyst", "Backend Engineer", "Software Engineer"],
  javascript: ["Frontend Engineer", "Full-stack Engineer", "Software Engineer", "Product Engineer"],
  typescript: ["Frontend Engineer", "Full-stack Engineer", "Product Engineer", "Backend Engineer", "Software Engineer", "Mobile Engineer"],
  java: ["Backend Engineer", "Software Engineer", "Mobile Engineer"],
  cpp: ["Embedded Engineer", "Software Engineer"],
  go: ["Backend Engineer", "DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer"],

  /* ----------------------------------------------------------- frameworks -- */
  react: ["Frontend Engineer", "Full-stack Engineer", "Product Engineer", "Mobile Engineer"],
  nextjs: ["Frontend Engineer", "Full-stack Engineer", "Product Engineer"],
  angular: ["Frontend Engineer", "Full-stack Engineer"],
  node: ["Backend Engineer", "Full-stack Engineer", "Software Engineer"],
  express: ["Backend Engineer", "Full-stack Engineer"],
  django: ["Backend Engineer", "Full-stack Engineer", "Software Engineer"],
  flask: ["Backend Engineer", "Software Engineer"],
  fastapi: ["Backend Engineer", "AI Engineer", "ML Engineer"],
  springboot: ["Backend Engineer", "Software Engineer"],
  android: ["Mobile Engineer"],

  /* ----------------------------------------------------------------- data -- */
  sql: ["Data Analyst", "Analytics Engineer", "Data Engineer", "Data Scientist", "Backend Engineer"],
  postgres: ["Backend Engineer", "Data Engineer", "Analytics Engineer"],
  mongodb: ["Backend Engineer", "Full-stack Engineer"],
  redis: ["Backend Engineer", "Cloud Engineer", "Site Reliability Engineer"],
  dbms: ["Backend Engineer", "Data Engineer", "Software Engineer"],
  spark: ["Data Engineer", "Data Scientist", "Analytics Engineer"],
  kafka: ["Data Engineer", "Backend Engineer"],
  airflow: ["Data Engineer", "Analytics Engineer", "MLOps Engineer"],
  dbt: ["Analytics Engineer", "Data Analyst", "Data Engineer"],
  dataviz: ["Data Analyst", "Analytics Engineer", "Data Scientist"],

  /* ------------------------------------------------------------------- ml -- */
  pytorch: ["ML Engineer", "AI Engineer", "Data Scientist"],
  tensorflow: ["ML Engineer", "AI Engineer"],
  sklearn: ["ML Engineer", "Data Scientist", "AI Engineer", "Data Analyst"],
  numpy: ["ML Engineer", "AI Engineer", "Data Scientist"],
  pandas: ["Data Analyst", "Data Scientist", "ML Engineer", "Analytics Engineer"],
  nlp: ["ML Engineer", "AI Engineer"],
  cv: ["ML Engineer", "AI Engineer"],
  transformers: ["ML Engineer", "AI Engineer"],
  llmapps: ["AI Engineer", "ML Engineer", "Product Engineer"],
  rag: ["AI Engineer", "ML Engineer", "Data Scientist"],
  aievals: ["AI Engineer", "MLOps Engineer", "ML Engineer", "QA Engineer"],
  mlops: ["MLOps Engineer", "ML Engineer", "AI Engineer", "DevOps Engineer"],

  /* ---------------------------------------------------------------- infra -- */
  docker: ["DevOps Engineer", "Cloud Engineer", "MLOps Engineer", "Site Reliability Engineer", "Backend Engineer", "Cybersecurity Engineer"],
  kubernetes: ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer", "MLOps Engineer"],
  aws: ["Cloud Engineer", "DevOps Engineer", "MLOps Engineer", "Backend Engineer"],
  azure: ["Cloud Engineer", "DevOps Engineer"],
  terraform: ["Cloud Engineer", "DevOps Engineer", "Site Reliability Engineer"],
  cicd: ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer", "QA Engineer", "Full-stack Engineer"],
  observability: ["Site Reliability Engineer", "DevOps Engineer", "Cloud Engineer", "MLOps Engineer"],

  /* ------------------------------------------------------------- practice -- */
  dsa: ["Software Engineer", "Backend Engineer", "Frontend Engineer", "ML Engineer", "Mobile Engineer"],
  rest: ["Backend Engineer", "Full-stack Engineer", "Frontend Engineer", "Mobile Engineer", "Product Engineer", "QA Engineer"],
  graphql: ["Frontend Engineer", "Full-stack Engineer", "Backend Engineer"],
  appsec: ["Cybersecurity Engineer", "Backend Engineer", "Full-stack Engineer"],
  testautomation: ["QA Engineer", "Full-stack Engineer", "Software Engineer", "Cybersecurity Engineer"],

  /* -------------------------------------------------------------- systems -- */
  systemdesign: ["Backend Engineer", "Software Engineer", "Full-stack Engineer", "Site Reliability Engineer"],
  distributed: ["Backend Engineer", "Data Engineer", "Site Reliability Engineer"],
  linux: ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer", "Cybersecurity Engineer", "Embedded Engineer"],
  networks: ["DevOps Engineer", "Cybersecurity Engineer", "Site Reliability Engineer", "Embedded Engineer"],
  os: ["Software Engineer", "Embedded Engineer", "Site Reliability Engineer"],
  embedded: ["Embedded Engineer"],
  ros: ["Embedded Engineer"],

  /* -------------------------------------------------------------- tooling -- */
  // Version control is the one skill every goal shares. It stays broad rather
  // than being cut for tidiness — ranking demotes it once the student holds it.
  git: [...GOAL_ROLE_CHOICES],
  figma: ["Product Engineer", "Frontend Engineer"],
};

/** The goals a skill serves, or an empty list when it serves none. */
export function goalRolesForSkill(skillId: string): readonly string[] {
  return SKILL_GOAL_ROLES[skillId] ?? [];
}

/** Every skill that moves a student towards `goal`, in catalogue order. */
export function skillsForGoal(goal: string): string[] {
  return Object.entries(SKILL_GOAL_ROLES)
    .filter(([, roles]) => roles.includes(goal))
    .map(([skillId]) => skillId);
}
