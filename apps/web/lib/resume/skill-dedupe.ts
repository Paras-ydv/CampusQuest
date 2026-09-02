/**
 * Decides whether a skill named in a résumé is one the catalogue already has
 * under a different name, or something genuinely new.
 *
 * This is the gate in front of ever *adding* a skill. Without it the catalogue
 * accumulates synonyms — `rag` alongside "Retrieval Augmented Generation",
 * `kubernetes` alongside "K8s / Container Orchestration" — and every one of
 * those splits a skill's meaning in two. Gaps, quests and opportunities all
 * join on `skill_id`, so a duplicate does not merely look untidy: a student
 * credited with the new row gets no credit for the old one, and the quests
 * attached to the original never surface for them.
 *
 * The judgement is semantic, which is why it is worth a model rather than
 * another alias list: "retrieval augmented generation" and `rag` share no
 * words, and no string metric relates them. Databricks answers the one
 * question a catalogue cannot answer for itself — *do these two names mean the
 * same thing?* — and the answer is verified against the catalogue before it is
 * acted on.
 */
import { SKILLS, type SkillKey } from "@/lib/data/skills";
import { chatEndpoint, databricksChat, jsonFromReply } from "@/lib/resume/databricks-chat";

/** What the model decided about one candidate skill name. */
export type DedupeVerdict =
  | { kind: "duplicate"; of: SkillKey; candidate: string }
  | { kind: "new"; candidate: string; name: string; category: string };

/** Categories the catalogue uses; a new skill must land in one of them. */
const CATEGORIES = ["language", "framework", "ml", "infra", "systems", "data", "practice", "tooling"] as const;

const SYSTEM = [
  "You maintain a skills catalogue and your job is to PREVENT DUPLICATE ENTRIES.",
  "For each candidate skill name, decide which existing catalogue entry it belongs to.",
  "",
  "Map a candidate to an existing id when they refer to the same competence:",
  '  - an acronym and its expansion: "RAG" = retrieval augmented generation',
  '  - a short form and its product: "K8s" = kubernetes',
  '  - the generic activity and the catalogue\'s entry for it:',
  '      "version control" = git, "unit testing" = testautomation,',
  '      "relational databases" = dbms, "container orchestration" = kubernetes,',
  '      "deep learning" = the catalogue\'s general ML entry',
  "  - A SPECIFIC TOOL and the catalogue entry for what it is used for. This is",
  "    the most commonly missed case. A tool is NOT a new skill when the",
  "    catalogue already covers its purpose:",
  '      "GitHub" and "GitLab" = git         (they are version control hosting)',
  '      "Playwright", "Cypress", "Selenium", "JUnit" = testautomation',
  '      "OpenTelemetry", "Grafana", "Datadog", "Prometheus" = observability',
  '      "spaCy", "NLTK" = nlp',
  '      "LangChain", "LangGraph", "AutoGen", "CrewAI" = llmapps',
  '      "Pinecone", "Qdrant", "Weaviate" = rag        (they are vector stores)',
  "    Ask yourself: does the catalogue already have an entry describing what",
  "    this tool is FOR? If yes, it is a duplicate.",
  "",
  "Answer null ONLY for a genuinely distinct technology the catalogue lacks —",
  'a language, framework or database in its own right ("Rust", "Svelte", "Elixir").',
  "A candidate that is a broader or narrower way of describing something already",
  "listed is a DUPLICATE, not a new skill: a second entry would split one skill in two.",
  "",
  'Use "skip" as duplicateOf for things that are not engineering skills at all:',
  'deployment hosts ("Vercel", "Render", "Netlify", "Heroku"), IDEs and editors,',
  "operating systems as products, and company or product names.",
  "",
  "Do NOT map two distinct products onto each other: PyTorch is not TensorFlow,",
  "computer vision is not NLP.",
  "",
  "Output ONLY a JSON array, one object per candidate, in the order given:",
  '  {"candidate":"<name as given>","duplicateOf":"<catalogue id>"}   when it already exists',
  '  {"candidate":"<name as given>","duplicateOf":null,"category":"<one of the listed categories>"}   when genuinely new',
  "",
  "When in doubt, prefer duplicateOf. A wrong merge is easy to correct; a",
  "duplicated catalogue entry silently breaks skill matching for every student.",
].join("\n");

/** The catalogue as `id = Name` lines. */
function catalogue(): string {
  return (Object.keys(SKILLS) as SkillKey[]).map((key) => `${key} = ${SKILLS[key].name}`).join("\n");
}

/**
 * Classifies each candidate name as a duplicate of an existing skill or as a
 * new one. Returns [] when Databricks is unavailable — the caller then adds
 * nothing, which is the safe direction: a missed skill is recoverable, a
 * duplicated taxonomy is not.
 */
export async function classifyCandidates(candidates: string[]): Promise<DedupeVerdict[]> {
  if (!candidates.length) return [];

  const reply = await databricksChat({
    endpoint: chatEndpoint(),
    system: SYSTEM,
    user: [
      "CATALOGUE:",
      catalogue(),
      "",
      `ALLOWED CATEGORIES: ${CATEGORIES.join(", ")}`,
      "",
      "CANDIDATES:",
      ...candidates.map((name) => `- ${name}`),
    ].join("\n"),
  });
  if (!reply) return [];

  return parseVerdicts(reply, candidates);
}

/**
 * Reads the model's decisions, keeping only those that are internally
 * consistent: a duplicate must name a real catalogue id, and a new skill must
 * carry a real category. Anything else is dropped rather than guessed at,
 * because both mistakes write to the taxonomy.
 */
export function parseVerdicts(reply: string, candidates: string[]): DedupeVerdict[] {
  const parsed = jsonFromReply(reply);
  if (!Array.isArray(parsed)) return [];

  const validIds = new Set<string>(Object.keys(SKILLS));
  const validCategories = new Set<string>(CATEGORIES);
  // Candidates are matched case-insensitively; the model tends to echo them
  // back with its own capitalisation.
  const wanted = new Map(candidates.map((name) => [name.toLowerCase().trim(), name]));
  const seen = new Set<string>();
  const verdicts: DedupeVerdict[] = [];

  for (const item of parsed) {
    const record = item as { candidate?: unknown; duplicateOf?: unknown; category?: unknown };
    if (typeof record.candidate !== "string") continue;
    const candidate = wanted.get(record.candidate.toLowerCase().trim());
    if (!candidate || seen.has(candidate)) continue;

    // "skip" marks something that is not an engineering skill at all — a
    // hosting platform, an editor, a company. It is neither merged nor added.
    if (record.duplicateOf === "skip") {
      seen.add(candidate);
      continue;
    }
    if (typeof record.duplicateOf === "string" && validIds.has(record.duplicateOf)) {
      seen.add(candidate);
      verdicts.push({ kind: "duplicate", of: record.duplicateOf as SkillKey, candidate });
      continue;
    }
    // A new skill needs a category the catalogue actually uses; without one
    // there is nothing sensible to insert.
    if (record.duplicateOf === null && typeof record.category === "string" && validCategories.has(record.category)) {
      seen.add(candidate);
      verdicts.push({ kind: "new", candidate, name: candidate, category: record.category });
    }
  }
  return verdicts;
}
