/**
 * The question catalogue warmed before a demo.
 *
 * Genie takes roughly twenty seconds to compose an answer — that is the
 * provider's time and no client change reduces it. But an identical question
 * from the same student is served out of `genie_messages` in well under a
 * second, with the real answer, the real SQL and the real table. Warming this
 * list turns the demo from a series of twenty-second pauses into instant
 * answers, without faking anything.
 *
 * The cache key is a hash of the student id plus the question, normalised by
 * trimming, collapsing whitespace and lowercasing. Phrasing must therefore
 * match what will be asked on stage; minor case and spacing differences are
 * tolerated, different wording is not.
 *
 * `expect` is an optional independent check. Where a question has a
 * deterministic answer we can compute ourselves, the SQL here is run directly
 * against the warehouse and compared with what Genie reported — that is how we
 * know an answer is right rather than merely fast.
 */
export const QUESTIONS = [
  // ---------------------------------------------------------- skill demand
  {
    area: "Time Machine",
    question: "Which skills appear most often in historical backend and software engineering roles?",
    expect: {
      label: "top skill share across Backend + Software Engineer roles",
      sql: `SELECT s.name, COUNT(DISTINCT r.role_id) AS n
            FROM workspace.campusquest.job_requirements r
            JOIN workspace.campusquest.job_roles j USING (role_id)
            JOIN workspace.campusquest.skills s USING (skill_id)
            WHERE j.role_family IN ('Backend Engineer','Software Engineer')
            GROUP BY s.name ORDER BY n DESC LIMIT 1`,
    },
  },
  { area: "Time Machine", question: "What skills are most important for my target role?" },
  { area: "Time Machine", question: "How has demand for Docker changed between 2022 and 2026?" },
  { area: "Time Machine", question: "Which skills do ML Engineer roles require most often?" },
  { area: "Time Machine", question: "Which skills do Data Engineer roles require most often?" },
  { area: "Time Machine", question: "Which skills do DevOps Engineer roles require most often?" },
  { area: "Time Machine", question: "Which skills do Frontend Engineer roles require most often?" },
  {
    area: "Time Machine",
    question: "How many job postings are there per year?",
    expect: {
      label: "postings per year",
      sql: `SELECT CAST(year AS STRING), COUNT(*) FROM workspace.campusquest.job_roles
            GROUP BY year ORDER BY year`,
    },
  },
  {
    area: "Time Machine",
    question: "How many historical roles are there per role family?",
    expect: {
      label: "roles per family",
      sql: `SELECT role_family, COUNT(*) FROM workspace.campusquest.job_roles
            GROUP BY role_family ORDER BY 2 DESC, 1`,
    },
  },

  // ------------------------------------------------------------- alignment
  { area: "Journey", question: "What should I learn next for my goal role, and why?" },
  { area: "Journey", question: "How many historical roles in my target family do I currently align with?" },
  { area: "Journey", question: "Which single skill would improve my alignment the most, and how many roles ask for it?" },
  { area: "Time Machine", question: "What happens to my historical role alignment if I learn Docker?" },

  // ---------------------------------------------------------- opportunities
  { area: "Radar", question: "Which opportunities best match my current skills?" },
  { area: "Radar", question: "What opportunities would help me close my biggest skill gap?" },
  { area: "Radar", question: "Which opportunities have the nearest deadlines?" },
  {
    area: "Radar",
    question: "How many opportunities are there of each type?",
    expect: {
      label: "opportunities by type",
      sql: `SELECT type, COUNT(*) FROM workspace.campusquest.opportunities
            GROUP BY type ORDER BY 2 DESC, 1`,
    },
  },

  // --------------------------------------------------------------- research
  { area: "Research", question: "Which research projects match my interests?" },
  { area: "Research", question: "Which professors are accepting students in my areas of interest?" },
  {
    area: "Research",
    question: "How many research projects are open in each research area?",
    expect: {
      label: "open projects per area",
      sql: `SELECT research_area, COUNT(*) FROM workspace.campusquest.research_projects
            WHERE status = 'open' GROUP BY research_area ORDER BY 2 DESC, 1`,
    },
  },

  // ----------------------------------------------------------------- people
  { area: "People", question: "Find students whose skills complement mine for an AI project." },
  { area: "People", question: "Which students share my target role and are looking for a team?" },
  {
    area: "People",
    question: "How many students are targeting each role?",
    expect: {
      label: "students per target role",
      sql: `SELECT target_role, COUNT(*) FROM workspace.campusquest.students
            GROUP BY target_role ORDER BY 2 DESC, 1`,
    },
  },

  // ----------------------------------------------------------------- quests
  { area: "Quests", question: "What should my next quest be, based on my biggest skill gap?" },
  { area: "Quests", question: "Which skill gap would gain me the most alignment if I closed it?" },
  { area: "Quests", question: "Which free learning resources close my largest skill gaps?" },

  // ------------------------------------------------------- companies/placement
  {
    area: "Placements",
    question: "Which companies posted the most roles overall?",
    expect: {
      label: "top hiring company",
      sql: `SELECT c.name, COUNT(*) AS n FROM workspace.campusquest.job_roles j
            JOIN workspace.campusquest.companies c USING (company_id)
            GROUP BY c.name ORDER BY n DESC, c.name LIMIT 1`,
    },
  },
  {
    area: "Placements",
    question: "What is the overall placement rate by year?",
    expect: {
      label: "placement outcomes by year",
      sql: `SELECT CAST(year AS STRING), COUNT(*) FROM workspace.campusquest.placement_history
            WHERE outcome = 'placed' GROUP BY year ORDER BY year`,
    },
  },
];
