import type { Skill } from "@campusquest/shared";

/**
 * Canonical skill catalogue.
 *
 * In production this mirrors the `skill_graph` Delta table that P2 owns — names
 * here must match it exactly, since gaps, quests and opportunities all join on
 * skill id. Until that table exists, this file is the taxonomy.
 */
export const SKILLS = {
  python: { id: "python", name: "Python", category: "language" },
  typescript: { id: "typescript", name: "TypeScript", category: "language" },
  cpp: { id: "cpp", name: "C++", category: "language" },
  sql: { id: "sql", name: "SQL", category: "data" },
  react: { id: "react", name: "React", category: "framework" },
  nextjs: { id: "nextjs", name: "Next.js", category: "framework" },
  fastapi: { id: "fastapi", name: "FastAPI", category: "framework" },
  node: { id: "node", name: "Node.js", category: "framework" },
  pytorch: { id: "pytorch", name: "PyTorch", category: "ml" },
  sklearn: { id: "sklearn", name: "scikit-learn", category: "ml" },
  transformers: { id: "transformers", name: "Transformers", category: "ml" },
  mlops: { id: "mlops", name: "MLOps", category: "ml" },
  docker: { id: "docker", name: "Docker", category: "infra" },
  kubernetes: { id: "kubernetes", name: "Kubernetes", category: "infra" },
  aws: { id: "aws", name: "AWS", category: "infra" },
  cicd: { id: "cicd", name: "CI/CD", category: "infra" },
  linux: { id: "linux", name: "Linux", category: "systems" },
  systemdesign: { id: "systemdesign", name: "System design", category: "systems" },
  distributed: { id: "distributed", name: "Distributed systems", category: "systems" },
  dsa: { id: "dsa", name: "Data structures & algorithms", category: "practice" },
  rest: { id: "rest", name: "REST APIs", category: "practice" },
  git: { id: "git", name: "Git", category: "tooling" },
  postgres: { id: "postgres", name: "PostgreSQL", category: "data" },
  spark: { id: "spark", name: "Spark", category: "data" },
  embedded: { id: "embedded", name: "Embedded systems", category: "systems" },
  cv: { id: "cv", name: "Computer vision", category: "ml" },
  ros: { id: "ros", name: "ROS", category: "systems" },
  figma: { id: "figma", name: "Figma", category: "tooling" },
} as const satisfies Record<string, Skill>;

export type SkillKey = keyof typeof SKILLS;

export const skill = (key: SkillKey): Skill => SKILLS[key];
export const skills = (...keys: SkillKey[]): Skill[] => keys.map(skill);

export const ALL_SKILLS: Skill[] = Object.values(SKILLS);
