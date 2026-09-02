/**
 * Reads the technology names a résumé lists that the catalogue does not
 * recognise at all.
 *
 * `skill-matcher.ts` finds the skills we know; `skill-resolver.ts` finds the
 * ones described in other words. This finds the third case: a name the
 * catalogue has never heard of — Qdrant, LangGraph, spaCy. Those go to
 * `skill-dedupe.ts`, which decides whether each is really an existing skill
 * under another name.
 *
 * Finding the names is done locally rather than by a model. Résumés list
 * technologies in a skills section as comma-separated runs, which a parser
 * reads reliably in a millisecond; asking a reasoning model to do it took
 * nearly twenty seconds and often returned nothing, because open-ended
 * extraction consumes its whole token budget. The model's judgement is spent
 * where it is actually needed — deciding whether a name duplicates something
 * the catalogue already has.
 */

/** Headings that introduce a résumé's technology list. */
const SECTION = /\b(technical skills|skills|technologies|tech stack|languages|tools|frameworks|platforms)\b/gi;

/** How much text after a heading is treated as part of the list. */
const SECTION_LENGTH = 600;

/** Names longer than this are prose, not a technology. */
const MAX_NAME_LENGTH = 30;

/**
 * Words that appear in skills sections as labels or filler rather than as
 * technologies. Without this the parser proposes "Languages" as a skill.
 */
const STOPWORDS = new Set([
  "languages", "language", "frameworks", "framework", "tools", "platforms", "technologies",
  "technical", "skills", "tech", "stack", "libraries", "library", "databases", "database",
  "concepts", "web", "backend", "frontend", "ai", "ml", "others", "other", "etc", "and",
  "coursework", "achievements", "education", "experience", "projects", "certifications",
]);

/**
 * Returns candidate technology names from the résumé's skills sections that
 * the deterministic matcher did not already account for.
 */
export function extractSkillCandidates(text: string, alreadyNamed: string[]): string[] {
  const known = new Set(alreadyNamed.map(normalizeKey));
  const seen = new Set<string>();
  const candidates: string[] = [];

  for (const section of skillSections(text)) {
    // Skills sections are punctuation-separated lists, but a category label
    // ends the previous list without any punctuation of its own — in
    // "… Java, Rust Tools/Platforms : Git …" the last value of one group and
    // the label of the next share a segment. Breaking before a label as well
    // as on punctuation keeps that final value ("Rust") from being swallowed.
    const runs = section.replace(/\s+([\w/&-]{2,24})\s*:/g, ",$1:");
    for (const raw of runs.split(/[,;|]+/)) {
      const name = clean(raw);
      if (!name) continue;
      const key = normalizeKey(name);
      if (!key || known.has(key) || seen.has(key)) continue;
      seen.add(key);
      candidates.push(name);
    }
  }
  return candidates;
}

/**
 * Headings that end a skills list. Without them a section runs on into the
 * next part of the résumé and proposes prize names as technologies.
 */
const SECTION_END = /\b(achievements?|awards?|education|experience|work experience|projects?|certifications?|publications?|interests?|activities|references)\b/i;

/** The text following each skills-section heading, up to the next section. */
function skillSections(text: string): string[] {
  const sections: string[] = [];
  for (const match of text.matchAll(SECTION)) {
    const start = (match.index ?? 0) + match[0].length;
    const window = text.slice(start, start + SECTION_LENGTH);
    const end = window.search(SECTION_END);
    sections.push(end === -1 ? window : window.slice(0, end));
  }
  return sections;
}

/**
 * Trims a list entry to a plausible technology name, or returns null when it
 * is a label, a sentence, or noise.
 */
function clean(raw: string): string | null {
  // A leading "Languages :" style label is stripped; the value is what matters.
  const name = raw
    .replace(/^[^:]{0,24}:\s*/, "")
    .replace(/[^\w+#./\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || name.length > MAX_NAME_LENGTH) return null;

  // Real technology names are one to three words; longer runs are prose that
  // slipped past the section boundary.
  const words = name.split(" ");
  if (words.length > 3) return null;
  if (words.every((word) => STOPWORDS.has(word.toLowerCase()))) return null;

  // Something must be alphabetic — a bare version number is not a skill.
  return /[a-zA-Z]{2}/.test(name) ? name : null;
}

function normalizeKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}
