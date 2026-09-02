import { z } from "zod";
import { Id, Percent } from "./common";
import { Skill } from "./skill";

export const Researcher = z.object({
  id: Id,
  name: z.string(),
  initials: z.string().length(2),
  title: z.string(),
  department: z.string(),
  areas: z.array(z.string()),
  /** Whether they are currently taking students. */
  openToStudents: z.boolean(),
  /**
   * Where to write to them.
   *
   * A researcher is not an app user — no profile row, no account — so they
   * cannot receive a connection request the way a peer does. Reaching them is
   * an email, which is how a student would approach a professor anyway.
   */
  email: z.string(),
});
export type Researcher = z.infer<typeof Researcher>;

export const Publication = z.object({
  id: Id,
  title: z.string(),
  venue: z.string(),
  year: z.number().int(),
  authors: z.array(z.string()),
  url: z.string().nullable().default(null),
});
export type Publication = z.infer<typeof Publication>;

export const ResearchProject = z.object({
  id: Id,
  title: z.string(),
  summary: z.string(),
  area: z.string(),
  lead: Researcher,
  requiredSkills: z.array(Skill),
  publications: z.array(Publication),
  openings: z.number().int().nonnegative(),
});
export type ResearchProject = z.infer<typeof ResearchProject>;

export const ResearchMatch = z.object({
  project: ResearchProject,
  matchPct: Percent,
  why: z.string(),
  /** Which of the student's interests connected them to this project. */
  viaInterests: z.array(z.string()),
  /** Candidate discovery path; the score itself is always deterministic. */
  retrievalSource: z.enum(["ai-search", "catalog"]).optional(),
});
export type ResearchMatch = z.infer<typeof ResearchMatch>;
