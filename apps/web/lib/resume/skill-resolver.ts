/**
 * Resolves résumé phrasings the alias table does not know onto the existing
 * skill catalogue, using a Databricks chat endpoint.
 *
 * The alias table in `skill-matcher.ts` is exact and cheap, but it can only
 * know the spellings someone thought to write down. Résumés say "retrieval
 * augmented generation" for `rag`, "container orchestration" for `kubernetes`,
 * "unit and integration testing" for `testautomation`. This is the layer that
 * catches those.
 *
 * Two rules make it safe to put a language model in this path:
 *
 *  1. It never invents an id. The model is given the catalogue and must answer
 *     with ids from it; anything else is discarded here, not trusted. So the
 *     worst case is a miss, never a bogus skill that breaks the `user_skills`
 *     foreign key or pollutes the taxonomy with a duplicate name.
 *  2. It is strictly additive and best-effort. Every failure — no credentials,
 *     a timeout, a bad response — returns the deterministic matches unchanged,
 *     which is why onboarding still works with Databricks switched off.
 */
import { SKILLS, type SkillKey } from "@/lib/data/skills";
import { chatEndpoint, databricksChat, databricksConfigured, jsonFromReply } from "@/lib/resume/databricks-chat";

/**
 * Number of exactly-matched skills above which the resolver is skipped. A
 * résumé that names a dozen technologies outright is not the case this pass
 * was built for, and the call costs several seconds.
 */
const RESOLVER_SKIP_THRESHOLD = 12;

export function resolverConfigured(): boolean {
  return databricksConfigured();
}

/**
 * The candidate list for the prompt: only the ids the exact matcher did *not*
 * find. Offering skills already identified invites the model to echo them back
 * as though it had discovered them.
 */
function candidates(exclude: Set<SkillKey>): string {
  return (Object.keys(SKILLS) as SkillKey[])
    .filter((key) => !exclude.has(key))
    .map((key) => `${key} = ${SKILLS[key].name}`)
    .join("\n");
}

/**
 * The prompt demands a quote per id rather than a bare list. Asked for a list,
 * the model returns most of the catalogue — it treats the task as "which of
 * these could plausibly apply". Requiring the exact supporting phrase from the
 * résumé, and dropping any answer whose quote is not in the document, is what
 * makes the output precise rather than exhaustive.
 */
const SYSTEM = [
  "You decide which of the listed skills a student's résumé provides EVIDENCE for.",
  "An exact matcher has already found every skill named outright, so the ones",
  "left are those a résumé would only describe in different words — e.g.",
  '"retrieval augmented generation" for rag, "container orchestration" for kubernetes.',
  "",
  'Output ONLY a JSON array: [{"id":"<id from the list>","quote":"<exact fragment from the RÉSUMÉ>"}]',
  "",
  "The quote must be text you found in the RÉSUMÉ section, never the skill's",
  "name from the candidate list. If no fragment of the résumé supports an id,",
  "omit it. Do not infer skills from the person's degree or job title.",
  "Most candidates will not apply — returning 0-3 items is normal and correct.",
].join("\n");

/**
 * Asks the model which catalogue skills the text demonstrates, excluding the
 * ones already found deterministically.
 */
export async function resolveExtraSkills(text: string, already: SkillKey[]): Promise<SkillKey[]> {
  // The exact matcher having found this many skills means the résumé names its
  // technologies plainly, which is the case this pass cannot improve on — it
  // exists for résumés that describe skills instead of naming them. Skipping
  // it there removes several seconds from the common upload for no loss.
  if (already.length >= RESOLVER_SKIP_THRESHOLD) return [];

  const endpoint = chatEndpoint();
  const known = new Set(already);

  const prompt = [
    "CANDIDATE SKILLS:",
    candidates(known),
    "",
    "RÉSUMÉ:",
    // The prose sections carry the phrasings worth resolving; the cap keeps
    // the request small and predictable.
    text.slice(0, 5000),
  ].join("\n");

  const reply = await databricksChat({ endpoint, system: SYSTEM, user: prompt });
  if (!reply) return [];
  // The résumé is passed so every suggestion must cite a phrase found in it.
  return parseSkillIds(reply, text).filter((id) => !known.has(id));
}

/** Collapses whitespace and case so a quote can be checked against the text. */
function comparable(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Reads catalogue ids out of the model's reply, keeping only those that are
 * both a real id *and* backed by a quote that genuinely appears in the résumé.
 *
 * The quote check is the load-bearing guard. Without it the model returns
 * nearly the whole catalogue, reasoning that a CS student might plausibly know
 * Android or ROS; requiring evidence from the document turns that back into a
 * claim it has to support. A hallucinated id and a hallucinated quote are both
 * discarded here rather than trusted.
 */
export function parseSkillIds(content: string, resume = ""): SkillKey[] {
  const parsed = jsonFromReply(content);
  if (!Array.isArray(parsed)) return [];

  const valid = new Set(Object.keys(SKILLS));
  const haystack = comparable(resume);
  const seen = new Set<string>();

  return parsed
    .flatMap((item) => {
      // Tolerates a bare id list as well as the {id, quote} shape asked for.
      const id = typeof item === "string" ? item : (item as { id?: unknown })?.id;
      const quote = typeof item === "object" && item ? (item as { quote?: unknown }).quote : undefined;
      if (typeof id !== "string") return [];
      const normalized = id.trim().toLowerCase();
      if (!valid.has(normalized) || seen.has(normalized)) return [];
      // When a résumé is supplied the quote must be found in it. A quote is
      // required in that case: an answer with no evidence is not accepted.
      if (haystack) {
        if (typeof quote !== "string" || quote.trim().length < 4) return [];
        if (!haystack.includes(comparable(quote))) return [];
      }
      seen.add(normalized);
      return [normalized as SkillKey];
    });
}
