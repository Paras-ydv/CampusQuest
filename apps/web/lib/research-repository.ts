import type { ResearchMatch, ResearchProject, Skill } from "@campusquest/shared";
import { DEMO_RESEARCH } from "@/lib/data/fixtures";
import { ALL_SKILLS } from "@/lib/data/skills";
import type { BackendProfile } from "@/lib/backend/profile";
import { analyticsTable, databricksSqlConfigured, executeDatabricksSql, parseSqlArray } from "@/lib/databricks/sql";
import { searchResearchCandidates, type ResearchSearchProfile } from "@/lib/databricks/ai-search";

type RawResearchProject = ResearchProject;
function tokens(value: string): Set<string> {
  return new Set(value.toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length > 2));
}

/**
 * Which of the student's interests genuinely connect them to this project.
 *
 * Two rules matter here, and getting either wrong produces confident nonsense
 * on the card:
 *
 * 1. Match against the *project's* area only. Scoring against the professor's
 *    whole portfolio made a bioinformatics project claim it matched
 *    "Distributed systems" because its lead also works in that area.
 * 2. A multi-word interest needs two shared words. On one word alone,
 *    "Distributed systems" matches "Control Systems" purely on "systems".
 */
function overlappingInterests(interests: string[], area: string): string[] {
  const target = tokens(area);
  return interests.filter((interest) => {
    const words = [...tokens(interest)];
    if (!words.length) return false;
    const shared = words.filter((word) => target.has(word)).length;
    return shared >= Math.min(2, words.length);
  });
}

export function scoreResearch(profile: Pick<BackendProfile, "interests" | "skills">, project: ResearchProject): { pct: number; viaInterests: string[] } {
  const viaInterests = overlappingInterests(profile.interests, project.area);
  const held = new Set(profile.skills.map((skill) => skill.id));
  const required = project.requiredSkills.length;
  const skillScore = required ? project.requiredSkills.filter((skill) => held.has(skill.id)).length / required : 1;
  const interestScore = viaInterests.length / Math.max(1, profile.interests.length);
  const score = interestScore * 0.5 + skillScore * 0.3 + (project.openings > 0 ? 1 : 0) * 0.1 + (project.lead.openToStudents ? 1 : 0) * 0.1;
  return { pct: Math.round(Math.min(100, score * 100)), viaInterests };
}

/**
 * ===========================================================================
 *  RESEARCH MATCHMAKER
 * ===========================================================================
 * The traversal the product promises, done in one query:
 *
 *   interest → research_area → professor → open project → publications
 *
 * `research_projects.research_area` is always an area its professor genuinely
 * publishes in, so a computer-vision professor can never surface here with only
 * a bioinformatics project. Skills come from `research_area_skills`, so the
 * card can say what a project would ask of the student.
 *
 * This replaces a reader that expected a single denormalised
 * `catalogue.schema.table` supplied by P4. That view was never provisioned, so
 * the screen silently served fixtures instead.
 */
const researchSql = (
  projects: string, professors: string, professorResearch: string,
  publications: string, areaSkills: string, skills: string,
) => `
WITH lead_areas AS (
  SELECT professor_id, collect_list(research_area) AS areas
  FROM ${professorResearch} GROUP BY professor_id
), area_skill AS (
  SELECT a.research_area, collect_list(concat_ws(char(1), sk.slug, sk.name)) AS skill_rows
  FROM ${areaSkills} a JOIN ${skills} sk ON sk.skill_id = a.skill_id
  GROUP BY a.research_area
), area_pubs AS (
  -- Only the professor's papers in this project's own area count as evidence.
  SELECT professor_id, research_area,
         collect_list(concat_ws(char(1), publication_id, title, venue, cast(year AS string))) AS publication_rows
  FROM ${publications} GROUP BY professor_id, research_area
)
SELECT p.project_id, p.title, p.research_area, p.status, p.open_positions, p.year_started,
       f.professor_id, f.name AS lead_name, f.department, f.designation, f.accepting_students,
       la.areas AS lead_areas,
       coalesce(sk.skill_rows, array()) AS skill_rows,
       coalesce(pb.publication_rows, array()) AS publication_rows
FROM ${projects} p
JOIN ${professors} f ON f.professor_id = p.professor_id
LEFT JOIN lead_areas la ON la.professor_id = f.professor_id
LEFT JOIN area_skill sk ON sk.research_area = p.research_area
LEFT JOIN area_pubs pb ON pb.professor_id = f.professor_id AND pb.research_area = p.research_area
ORDER BY p.open_positions DESC, p.project_id`;

function initialsOf(name: string): string {
  const letters = name.replace(/^Dr\.?\s*/i, "").replace(/[^a-zA-Z ]/g, "").trim().split(/\s+/);
  const value = ((letters[0]?.[0] ?? "") + (letters[1]?.[0] ?? letters[0]?.[1] ?? "")).toUpperCase();
  return value.padEnd(2, "X").slice(0, 2);
}

function rowToProject(row: Record<string, unknown>): ResearchProject {
  const area = String(row.research_area);
  const requiredSkills: Skill[] = parseSqlArray(row.skill_rows).map((entry) => {
    const [id, name] = entry.split("\u0001");
    return ALL_SKILLS.find((candidate) => candidate.id === id) ?? { id, name: name || id, category: "practice" as const };
  });
  const leadName = String(row.lead_name);
  const publications = parseSqlArray(row.publication_rows).map((entry) => {
    const [id, title, venue, year] = entry.split("\u0001");
    return { id, title, venue, year: Number(year), authors: [leadName], url: null };
  });

  const openings = Number(row.open_positions ?? 0);
  return {
    id: String(row.project_id),
    title: String(row.title),
    summary: `${area} research led by ${leadName} (${String(row.department)}). ${
      openings > 0 ? `${openings} student ${openings === 1 ? "position" : "positions"} open.` : "No open positions right now."
    }`,
    area,
    lead: {
      id: String(row.professor_id),
      name: leadName,
      initials: initialsOf(leadName),
      title: String(row.designation ?? "Professor"),
      department: String(row.department ?? ""),
      areas: parseSqlArray(row.lead_areas),
      openToStudents: row.accepting_students === true || row.accepting_students === "true",
    },
    requiredSkills,
    publications,
    openings,
  };
}

/** Reads the real research graph. Returns null when Databricks is unconfigured. */
export async function loadDatabricksResearchProjects(): Promise<ResearchProject[] | null> {
  if (!databricksSqlConfigured()) return null;
  const result = await executeDatabricksSql(
    researchSql(
      analyticsTable("research_projects"), analyticsTable("professors"), analyticsTable("professor_research"),
      analyticsTable("publications"), analyticsTable("research_area_skills"), analyticsTable("skills"),
    ),
    [], 200,
  );
  return result.rows
    .map((row) => Object.fromEntries(result.columns.map((column, index) => [column, row[index]])))
    .map(rowToProject);
}

export async function researchMatches(profile: ResearchSearchProfile): Promise<ResearchMatch[]> {
  // Fixtures are the offline path only. When Databricks *is* configured, a
  // failed query is a real failure and must surface — silently serving demo
  // research is how this screen looked fine while being entirely fake.
  let projects: RawResearchProject[];
  if (databricksSqlConfigured()) {
    projects = (await loadDatabricksResearchProjects()) ?? [];
  } else {
    projects = DEMO_RESEARCH.map((match) => match.project);
  }
  const candidates = await searchResearchCandidates(profile);
  const candidateRanks = candidates?.length ? new Map(candidates.map((candidate) => [candidate.projectId, candidate.rank])) : null;
  // A non-empty candidate response is authoritative. Empty/error responses
  // deliberately use the whole catalog so an index outage never blanks Research.
  const selectedProjects = candidateRanks?.size
    ? projects.filter((project) => candidateRanks.has(project.id))
    : projects;

  return selectedProjects.map((project) => {
    const { pct, viaInterests } = scoreResearch(profile, project);
    const held = new Set(profile.skills.map((skill) => skill.id));
    const heldNames = project.requiredSkills.filter((skill) => held.has(skill.id)).map((skill) => skill.name);
    const openingText = project.openings > 0
      ? `${project.openings} ${project.openings === 1 ? "opening is" : "openings are"} available.`
      : "There are currently no openings.";
    const why = `${viaInterests.join(" and ") || project.area} aligns with this project${heldNames.length ? `, and you already hold ${heldNames.join(" and ")}` : ""}. ${openingText}`;
    return {
      project, matchPct: pct, viaInterests, why,
      ...(candidateRanks ? { retrievalSource: "ai-search" as const } : { retrievalSource: "catalog" as const }),
    } satisfies ResearchMatch;
  }).sort((left, right) =>
    right.matchPct - left.matchPct ||
    (candidateRanks ? (candidateRanks.get(left.project.id)! - candidateRanks.get(right.project.id)!) : 0) ||
    left.project.title.localeCompare(right.project.title),
  );
}
