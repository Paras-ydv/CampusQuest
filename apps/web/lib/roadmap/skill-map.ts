/**
 * ===========================================================================
 *  SKILL → ROADMAP
 * ===========================================================================
 * Which roadmap.sh roadmap teaches a CampusQuest skill.
 *
 * Two kinds of entry, and the difference is shown to the student rather than
 * hidden:
 *
 *   exact   — the roadmap is about this skill. "Docker" → the Docker roadmap.
 *   broader — no roadmap for this skill, but one covers it. "PyTorch" → the
 *             Machine Learning roadmap. The UI says so, because silently
 *             showing a student the wrong roadmap and calling it theirs is the
 *             same class of error as a fabricated resource link.
 *
 * Skills with no honest match are absent, and the roadmap panel simply does not
 * appear for them. That is deliberate: `azure` does not map to the AWS roadmap,
 * and `embedded` / `ros` have no upstream equivalent at all.
 *
 * Slugs were checked against the 92 roadmaps published at the time of writing;
 * `npm run roadmap:check` re-verifies them.
 */

export type RoadmapMatch = "exact" | "broader";

export type RoadmapLink = {
  slug: string;
  match: RoadmapMatch;
  /** Shown when `match` is "broader", to explain what the student is looking at. */
  note?: string;
};

export const SKILL_ROADMAPS: Readonly<Record<string, RoadmapLink>> = {
  /* ------------------------------------------------------------- exact -- */
  python: { slug: "python", match: "exact" },
  typescript: { slug: "typescript", match: "exact" },
  javascript: { slug: "javascript", match: "exact" },
  java: { slug: "java", match: "exact" },
  cpp: { slug: "cpp", match: "exact" },
  go: { slug: "golang", match: "exact" },
  sql: { slug: "sql", match: "exact" },
  react: { slug: "react", match: "exact" },
  nextjs: { slug: "nextjs", match: "exact" },
  angular: { slug: "angular", match: "exact" },
  node: { slug: "nodejs", match: "exact" },
  django: { slug: "django", match: "exact" },
  springboot: { slug: "spring-boot", match: "exact" },
  android: { slug: "android", match: "exact" },
  graphql: { slug: "graphql", match: "exact" },
  docker: { slug: "docker", match: "exact" },
  kubernetes: { slug: "kubernetes", match: "exact" },
  aws: { slug: "aws", match: "exact" },
  terraform: { slug: "terraform", match: "exact" },
  linux: { slug: "linux", match: "exact" },
  mongodb: { slug: "mongodb", match: "exact" },
  redis: { slug: "redis", match: "exact" },
  mlops: { slug: "mlops", match: "exact" },
  systemdesign: { slug: "system-design", match: "exact" },
  dsa: { slug: "datastructures-and-algorithms", match: "exact" },
  rest: { slug: "api-design", match: "exact" },
  git: { slug: "git-github", match: "exact" },
  postgres: { slug: "postgresql-dba", match: "exact" },
  figma: { slug: "ux-design", match: "exact" },

  /* ----------------------------------------------------------- broader -- */
  pytorch: { slug: "machine-learning", match: "broader", note: "Machine Learning covers PyTorch" },
  tensorflow: { slug: "machine-learning", match: "broader", note: "Machine Learning covers TensorFlow" },
  sklearn: { slug: "machine-learning", match: "broader", note: "Machine Learning covers scikit-learn" },
  transformers: { slug: "machine-learning", match: "broader", note: "Machine Learning covers Transformers" },
  nlp: { slug: "machine-learning", match: "broader", note: "NLP sits inside the Machine Learning roadmap" },
  cv: { slug: "machine-learning", match: "broader", note: "Computer vision sits inside the Machine Learning roadmap" },
  pandas: { slug: "python-data-analysis", match: "broader", note: "Pandas is part of Python Data Analysis" },
  numpy: { slug: "python-data-analysis", match: "broader", note: "NumPy is part of Python Data Analysis" },
  spark: { slug: "data-engineer", match: "broader", note: "Spark sits inside the Data Engineer roadmap" },
  kafka: { slug: "data-engineer", match: "broader", note: "Kafka sits inside the Data Engineer roadmap" },
  airflow: { slug: "data-engineer", match: "broader", note: "Airflow sits inside the Data Engineer roadmap" },
  cicd: { slug: "devops", match: "broader", note: "CI/CD sits inside the DevOps roadmap" },
  distributed: { slug: "system-design", match: "broader", note: "Distributed systems sit inside System Design" },
  os: { slug: "computer-science", match: "broader", note: "Operating systems sit inside Computer Science" },
  networks: { slug: "computer-science", match: "broader", note: "Computer networks sit inside Computer Science" },
  dbms: { slug: "sql", match: "broader", note: "Closest published roadmap is SQL" },
  express: { slug: "nodejs", match: "broader", note: "Express sits inside the Node.js roadmap" },
  flask: { slug: "backend", match: "broader", note: "Closest published roadmap is Backend" },
  fastapi: { slug: "backend", match: "broader", note: "Closest published roadmap is Backend" },

  /*
   * Intentionally unmapped: azure (the AWS roadmap is a different cloud, not a
   * broader one), embedded, ros. Upstream has no honest equivalent.
   */
};

export function roadmapForSkill(skillId: string): RoadmapLink | null {
  return SKILL_ROADMAPS[skillId] ?? null;
}

/** Every distinct roadmap the catalogue references, for the outline generator. */
export function referencedSlugs(): string[] {
  return [...new Set(Object.values(SKILL_ROADMAPS).map((r) => r.slug))].sort();
}
