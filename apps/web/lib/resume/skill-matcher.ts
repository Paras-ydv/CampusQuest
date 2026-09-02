/**
 * Maps résumé prose onto the canonical skill taxonomy.
 *
 * This is the CampusQuest-shaped half of hiring-agent's `skills.jinja`: that
 * prompt asks an LLM for whatever skills a résumé mentions, which is right when
 * the output is read by a human recruiter. Here the output feeds gaps, quests
 * and opportunities, all of which join on `skill_id` — so an extraction that
 * invents "React.js" or "k8s" is worse than one that finds nothing. Every
 * result is therefore a real key of `SKILLS`.
 *
 * Deliberately deterministic: the same PDF always produces the same skills, it
 * costs no API call, it works in local-fallback mode, and it is unit-testable.
 * An LLM pass can be layered in front of this later — it would still have to
 * resolve its answers through this table to produce ids.
 */
import { SKILLS, type SkillKey } from "@/lib/data/skills";

/**
 * Extra spellings per skill. The canonical `name` and the id itself are always
 * matched, so this carries only what those miss: abbreviations, vendor
 * spellings, and the phrasings résumés actually use.
 */
const ALIASES: Partial<Record<SkillKey, string[]>> = {
  python: ["python3"],
  typescript: ["ts"],
  cpp: ["c++", "cplusplus"],
  sql: ["mysql", "sqlite", "t-sql", "plsql", "pl/sql"],
  react: ["react.js", "reactjs", "react native"],
  nextjs: ["next.js"],
  node: ["nodejs", "node.js", "node"],
  pytorch: ["torch"],
  sklearn: ["sklearn", "scikit learn", "scikitlearn"],
  transformers: ["hugging face", "huggingface", "bert"],
  mlops: ["ml ops", "model serving", "mlflow", "kubeflow"],
  docker: ["containerization", "containerisation", "docker compose"],
  kubernetes: ["k8s", "kubectl", "helm"],
  aws: ["amazon web services", "ec2", "dynamodb"],
  cicd: ["ci/cd", "continuous integration", "continuous delivery", "github actions", "jenkins", "gitlab ci"],
  linux: ["unix", "bash", "shell scripting", "ubuntu"],
  systemdesign: ["software architecture", "hld", "lld"],
  distributed: ["microservices", "consensus", "raft"],
  dsa: ["data structures", "algorithms", "competitive programming", "leetcode", "codeforces"],
  rest: ["rest api", "rest apis", "restful", "api development"],
  git: ["github", "gitlab", "version control", "bitbucket"],
  postgres: ["postgres", "psql"],
  spark: ["apache spark", "pyspark", "databricks"],
  embedded: ["embedded c", "microcontroller", "arduino", "stm32", "rtos", "firmware"],
  cv: ["opencv", "image processing", "object detection", "yolo"],
  ros: ["robot operating system", "ros2", "ros"],
  figma: ["wireframing", "prototyping"],
  java: ["jvm"],
  javascript: ["js", "es6", "ecmascript"],
  go: ["golang"],
  os: ["concurrency", "multithreading"],
  networks: ["networking", "tcp/ip"],
  dbms: ["database management", "relational databases"],
  graphql: ["apollo"],
  express: ["express.js", "expressjs"],
  springboot: ["spring", "springboot"],
  django: ["django rest framework", "drf"],
  azure: ["microsoft azure"],
  terraform: ["infrastructure as code", "iac"],
  mongodb: ["mongo", "mongoose"],
  kafka: ["apache kafka"],
  airflow: ["apache airflow", "dags"],
  pandas: ["dataframe"],
  tensorflow: ["keras"],
  nlp: ["natural language processing", "text classification"],
  android: ["android studio", "kotlin", "jetpack compose"],
  llmapps: ["llm", "llms", "large language model", "prompt engineering", "langchain", "openai api"],
  rag: ["retrieval augmented generation", "vector database", "pinecone", "embeddings"],
  aievals: ["model evaluation", "llm evaluation", "evals"],
  observability: ["prometheus", "grafana", "datadog", "opentelemetry"],
  appsec: ["penetration testing", "owasp", "cybersecurity", "web security"],
  testautomation: ["selenium", "playwright", "cypress", "pytest", "junit", "unit testing"],
  dataviz: ["data visualisation", "tableau", "power bi", "matplotlib", "d3.js"],
};

export type ResumeSkillMatch = {
  skillId: SkillKey;
  /** The spelling found in the résumé, so the student can see why we picked it. */
  matchedOn: string;
};

/** Lowercases and collapses punctuation so "Node.js," and "node js" agree. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’“”]/g, "'")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Escapes a term for use inside a RegExp. */
function escape(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The search terms for one skill: its id, its display name, and its aliases,
 * longest first so "spring boot" is preferred over "spring".
 */
function termsFor(key: SkillKey): string[] {
  const seen = new Set<string>();
  for (const term of [SKILLS[key].name, key, ...(ALIASES[key] ?? [])]) {
    const normalized = normalize(term);
    if (normalized.length >= 2) seen.add(normalized);
  }
  return [...seen].sort((a, b) => b.length - a.length);
}

/**
 * A term matches only on a word boundary, so "go" cannot fire inside "google"
 * and "ts" cannot fire inside "artifacts".
 *
 * `+` and `#` are word characters throughout, which is what makes "c++" match.
 * `.` and `/` are the awkward pair: they sit *inside* terms ("node.js",
 * "ci/cd") but also end sentences ("…and DSA."). So a trailing "." or "/"
 * only blocks the match when a letter or digit follows it — "node.js" stays
 * one token, while "dsa." and "ci/cd." terminate cleanly.
 */
function mentions(haystack: string, term: string): boolean {
  // A leading "." or "/" is only a boundary when it does not itself continue a
  // word — otherwise "js" would match inside "node.js" and claim JavaScript
  // from every résumé that mentions Node.
  const before = "(^|[^a-z0-9+#./]|(?<![a-z0-9])[./])";
  const after = "($|[^a-z0-9+#./]|[./](?![a-z0-9]))";
  return new RegExp(`${before}${escape(term)}${after}`).test(haystack);
}

/**
 * Returns every canonical skill the text mentions, ordered by the taxonomy so
 * the result is stable regardless of where each term appeared in the document.
 */
export function matchSkills(text: string): ResumeSkillMatch[] {
  const haystack = normalize(text);
  if (!haystack) return [];

  const matches: ResumeSkillMatch[] = [];
  for (const key of Object.keys(SKILLS) as SkillKey[]) {
    const hit = termsFor(key).find((term) => mentions(haystack, term));
    if (hit) matches.push({ skillId: key, matchedOn: hit });
  }
  return matches;
}
