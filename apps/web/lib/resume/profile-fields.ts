/**
 * Pulls the "about you" fields out of a résumé: name, branch and academic year.
 *
 * This is the deterministic counterpart to hiring-agent's `basics.jinja` and
 * `education.jinja`. Those prompt an LLM for free-form JSON; here branch and
 * year must land on `BRANCHES` and `AcademicYear`, because onboarding renders
 * them as fixed choices — so this resolves onto those vocabularies or returns
 * nothing at all.
 *
 * Every field is a *suggestion*. The wizard shows each one pre-filled and the
 * student corrects it, which is the only safe contract for heuristics this
 * rough: a wrong guess they can see beats a blank field, and beats a wrong
 * guess they cannot see.
 */
import { BRANCHES } from "@/lib/data/profile-options";
import type { AcademicYear } from "@campusquest/shared";

/** Degree wording mapped onto the branches onboarding actually offers. */
const BRANCH_HINTS: [string, (typeof BRANCHES)[number]][] = [
  ["computer science", "Computer Science"],
  ["computer engineering", "Computer Science"],
  ["cse", "Computer Science"],
  ["information technology", "Information Technology"],
  ["information science", "Information Technology"],
  ["software engineering", "Computer Science"],
  ["electronics and communication", "Electronics"],
  ["electronics & communication", "Electronics"],
  ["electronics", "Electronics"],
  ["ece", "Electronics"],
  ["electrical", "Electrical"],
  ["mechanical", "Mechanical"],
  ["mathematics", "Mathematics"],
  ["maths", "Mathematics"],
  ["civil", "Civil"],
  ["chemical", "Chemical"],
];

/** Explicit "3rd year" style statements, which beat any graduation-date maths. */
const YEAR_WORDS: [RegExp, AcademicYear][] = [
  [/\b(1st|first)[-\s]year\b|\bfreshman\b/, 1],
  [/\b(2nd|second)[-\s]year\b|\bsophomore\b/, 2],
  [/\b(3rd|third)[-\s]year\b|\bjunior\b/, 3],
  [/\b(4th|fourth)[-\s]year\b|\bsenior\b/, 4],
  [/\b(5th|fifth)[-\s]year\b/, 5],
];

export type ResumeProfileFields = {
  name: string | null;
  branch: string | null;
  year: AcademicYear | null;
};

/** Lowercased, punctuation-collapsed text for the keyword passes. */
function haystack(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9&\s./-]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * The name is the hardest field to get right and the most obvious when wrong,
 * so this is deliberately strict: résumés lead with the candidate's name, so
 * only the opening words are considered, and only when they look like a name
 * — two or three capitalised words, no digits, no e-mail, no section heading.
 */
export function extractName(text: string): string | null {
  const head = text.slice(0, 200).replace(/\s+/g, " ").trim();
  if (!head) return null;

  // Stop at the first thing that is clearly no longer the name line. Contact
  // details follow the name on essentially every résumé, so a phone number,
  // e-mail, separator or digit ends it.
  const candidate = head.split(/[|·,@+\d]|\b(?:curriculum vitae|resume|résumé)\b/i)[0]?.trim() ?? "";

  // Take the leading run of name-shaped words rather than requiring every word
  // to qualify: a stray token after the name (a degree suffix, a leftover
  // symbol) should not discard a name we read correctly.
  // Words that begin the line *after* the name on essentially every résumé.
  // Extraction flattens the document to one line, so without this a third
  // capitalised word — "Priya Nair Bachelor" — reads as part of the name.
  const NEXT_SECTION = /^(bachelor|master|b\.?tech|m\.?tech|b\.?e|b\.?sc|m\.?sc|education|experience|skills|summary|objective|profile|contact|projects?)$/i;

  const words: string[] = [];
  for (const word of candidate.split(" ").filter(Boolean)) {
    // Hyphenation ends the name. A double-barrelled surname is capitalised on
    // both sides ("Smith-Jones"); a lower-case tail is a compound adjective
    // starting the summary — "Shivansh Bhageria Pre-final-year" is a name and
    // then a sentence.
    if (/-[a-z]/.test(word) || word.endsWith("-")) break;
    if (!/^[A-Z][a-zA-Z'’.-]{1,20}$/.test(word) || NEXT_SECTION.test(word)) break;
    words.push(word);
    if (words.length === 3) break;
  }
  return words.length >= 2 ? words.join(" ") : null;
}

/** Matches the longest degree phrase first, so "computer science" beats "cse". */
export function extractBranch(text: string): string | null {
  const hay = haystack(text);
  const hit = [...BRANCH_HINTS]
    .sort(([a], [b]) => b.length - a.length)
    .find(([phrase]) => new RegExp(`(^|[^a-z])${phrase}($|[^a-z])`).test(hay));
  return hit?.[1] ?? null;
}

/**
 * Prefers an explicit "3rd year"; otherwise derives the year from a graduation
 * date, which is how most résumés state it. A degree is assumed to be four
 * years, and anything outside 1–5 is discarded rather than clamped — a student
 * who has already graduated should get a blank field, not "year 5".
 */
export function extractYear(text: string, now = new Date()): AcademicYear | null {
  const hay = haystack(text);

  const stated = YEAR_WORDS.find(([pattern]) => pattern.test(hay));
  if (stated) return stated[1];

  // "expected graduation: may 2027", "class of 2027", or a study range whose
  // end year is the graduation — written "2023 - 2027" but just as often
  // "Aug 2023 -- Jun 2027", so month names are allowed between the years.
  const graduation =
    hay.match(/(?:expected|graduation|graduating|class of|batch of)[^0-9]{0,20}(20\d\d)/) ??
    // A study range's end year is the graduation. The separator is written
    // every possible way — "2023-2027", "2023 to 2027", and, because TeX
    // renders an en-dash through a font with no Unicode mapping, "Aug 2023 {
    // Jun 2027", where normalisation has already reduced the dash to a space.
    // So the rule is simply: two years, with at most a dash, the word "to" and
    // one month between them.
    hay.match(/20\d\d\s*(?:[-–—]+\s*|to\s+|\s)(?:[a-z]{3,9}\.?\s+)?(20\d\d)/);
  const graduationYear = graduation ? Number(graduation[1]) : null;
  if (!graduationYear) return null;

  // Academic years roll over mid-year, so a student graduating in 2027 is in
  // their final year from mid-2026.
  const academicStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const yearsRemaining = graduationYear - academicStart;
  // Someone whose course has already ended is not in any year of it. Without
  // this a 2022-2026 graduate came out as "year 5", which is a real option in
  // the form and so passes silently.
  if (yearsRemaining <= 0) return null;
  const year = 4 - yearsRemaining + 1;
  return year >= 1 && year <= 5 ? (year as AcademicYear) : null;
}

export function extractProfileFields(text: string, now = new Date()): ResumeProfileFields {
  return { name: extractName(text), branch: extractBranch(text), year: extractYear(text, now) };
}
