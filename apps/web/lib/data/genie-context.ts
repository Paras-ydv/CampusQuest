import type { GenieSuggestion } from "@campusquest/shared";

/**
 * What Genie should offer to answer on each screen.
 *
 * A single generic prompt makes Genie look like a bolted-on chatbot. Seeding
 * it with what the current screen is actually about is what makes it read as
 * the intelligence layer underneath the product rather than a widget beside it.
 *
 * Every question here is answerable from the attached Unity Catalog tables.
 */
const SUGGESTIONS: Record<string, GenieSuggestion[]> = {
  "/journey": [
    { id: "j1", label: "What should I learn next?", question: "What should I learn next for my goal role, and why?" },
    { id: "j2", label: "Where do I stand?", question: "How many historical roles in my target family do I currently align with?" },
    /*
     * Two measures, named separately. Asked as one question — "how many roles
     * ask for it" — Genie computed the roles the skill would newly align the
     * student with (9) and reported it under the words of the other measure,
     * the roles that request the skill at all (21). Both numbers are useful
     * and neither is wrong; the sentence was.
     */
    { id: "j3", label: "Biggest gap", question: "Which single skill would improve my alignment the most? Report both how many roles in my target family request that skill, and how many additional roles I would align with after learning it." },
  ],
  "/time-machine": [
    { id: "t1", label: "Most-wanted skills", question: "What skills are most important for my target role in historical postings?" },
    { id: "t2", label: "What if I learn Docker?", question: "What happens to my historical role alignment if I learn Docker?" },
    { id: "t3", label: "Demand over time", question: "How has demand for my target role's top skills changed between 2022 and 2026?" },
  ],
  "/radar": [
    { id: "o1", label: "Best matches", question: "Which opportunities best match my current skills?" },
    { id: "o2", label: "Close my biggest gap", question: "What opportunities would help me close my biggest skill gap?" },
    { id: "o3", label: "Closing soon", question: "Which opportunities have the nearest deadlines?" },
  ],
  "/research": [
    { id: "r1", label: "Projects for me", question: "Which research projects match my interests?" },
    { id: "r2", label: "Who to approach", question: "Which professors are accepting students in my areas of interest?" },
    { id: "r3", label: "Evidence", question: "What has this professor published in the area of their open project?" },
  ],
  "/people": [
    { id: "p1", label: "Complementary teammates", question: "Find students whose skills complement mine for an AI project." },
    { id: "p2", label: "Same goal", question: "Which students share my target role and are looking for a team?" },
  ],
  "/quests": [
    { id: "q1", label: "My next quest", question: "What should my next quest be, based on my biggest skill gap?" },
    { id: "q2", label: "Highest impact", question: "Which skill gap would gain me the most alignment if I closed it?" },
  ],
  "/messages": [
    { id: "m1", label: "Who to team with", question: "Which students would complement my skills on a hackathon team?" },
  ],
};

const FALLBACK: GenieSuggestion[] = SUGGESTIONS["/journey"];

/** Suggestions for a pathname, tolerating nested and trailing-slash routes. */
export function genieSuggestionsFor(pathname: string): GenieSuggestion[] {
  const key = Object.keys(SUGGESTIONS).find(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  return key ? SUGGESTIONS[key] : FALLBACK;
}

/** Human label for the current screen, shown in the panel header. */
export function genieScopeLabel(pathname: string): string {
  const labels: Record<string, string> = {
    "/journey": "your journey", "/time-machine": "the Time Machine",
    "/radar": "the Opportunity Radar", "/research": "research",
    "/people": "people", "/quests": "quests", "/messages": "messages",
  };
  const key = Object.keys(labels).find((route) => pathname === route || pathname.startsWith(`${route}/`));
  return key ? labels[key] : "campus data";
}
