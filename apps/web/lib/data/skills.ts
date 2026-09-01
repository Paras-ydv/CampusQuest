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

  // Extended to cover the full warehouse vocabulary. A gap whose slug is
  // missing here renders with a guessed category and no proper label.
  java: { id: "java", name: "Java", category: "language" },
  javascript: { id: "javascript", name: "JavaScript", category: "language" },
  go: { id: "go", name: "Go", category: "language" },
  os: { id: "os", name: "Operating Systems", category: "systems" },
  networks: { id: "networks", name: "Computer Networks", category: "systems" },
  dbms: { id: "dbms", name: "DBMS", category: "data" },
  graphql: { id: "graphql", name: "GraphQL", category: "practice" },
  express: { id: "express", name: "Express", category: "framework" },
  springboot: { id: "springboot", name: "Spring Boot", category: "framework" },
  django: { id: "django", name: "Django", category: "framework" },
  flask: { id: "flask", name: "Flask", category: "framework" },
  angular: { id: "angular", name: "Angular", category: "framework" },
  azure: { id: "azure", name: "Azure", category: "infra" },
  terraform: { id: "terraform", name: "Terraform", category: "infra" },
  mongodb: { id: "mongodb", name: "MongoDB", category: "data" },
  redis: { id: "redis", name: "Redis", category: "data" },
  kafka: { id: "kafka", name: "Kafka", category: "data" },
  airflow: { id: "airflow", name: "Airflow", category: "data" },
  pandas: { id: "pandas", name: "Pandas", category: "ml" },
  numpy: { id: "numpy", name: "NumPy", category: "ml" },
  tensorflow: { id: "tensorflow", name: "TensorFlow", category: "ml" },
  nlp: { id: "nlp", name: "NLP", category: "ml" },
  android: { id: "android", name: "Android", category: "framework" },
} as const satisfies Record<string, Skill>;

export type SkillKey = keyof typeof SKILLS;

export const skill = (key: SkillKey): Skill => SKILLS[key];
export const skills = (...keys: SkillKey[]): Skill[] => keys.map(skill);

export const ALL_SKILLS: Skill[] = Object.values(SKILLS);
