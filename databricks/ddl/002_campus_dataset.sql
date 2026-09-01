-- CampusQuest dataset — the fourteen tables of the data foundation
-- ---------------------------------------------------------------------------
-- Replace {{catalog}} and {{schema}} before executing, or run
--   node scripts/load-campus-dataset.mjs
-- which applies this file and then loads databricks/seed/data/*.csv.
--
-- Column comments are load-bearing, not documentation. Genie reads them to
-- decide what to join, and its SQL accuracy degrades as schema surface grows;
-- fourteen well-commented tables outperform eighteen thin ones.

CREATE SCHEMA IF NOT EXISTS {{catalog}}.{{schema}};

-- ------------------------------------------------------------ student graph

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.skills (
  skill_id STRING NOT NULL COMMENT 'Stable skill identifier, e.g. SK008. The single shared vocabulary: student_skills, job_requirements and opportunity_skills all reference this.',
  slug STRING NOT NULL COMMENT 'The same skill as the application keys it (docker, dsa, systemdesign). Lets analytical and operational data join without a translation table.',
  name STRING NOT NULL COMMENT 'Display name, e.g. "Data Structures & Algorithms".',
  category STRING NOT NULL COMMENT 'One of language, framework, data, infra, ml, systems, tooling, practice.'
) USING DELTA COMMENT 'The join hub. Every skill reference in the warehouse resolves here; there are no orphan skill ids.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.students (
  student_id STRING NOT NULL COMMENT 'Synthetic student identifier, e.g. S0000. Not a real person.',
  name STRING NOT NULL COMMENT 'Synthetic name. Never surface this in an answer about an individual.',
  branch STRING NOT NULL COMMENT 'Engineering branch: CSE, ISE, ECE, EEE, ME or AIML.',
  year INT NOT NULL COMMENT 'Year of study, 1 to 4. Placement history exists only for year 4.',
  cgpa DOUBLE COMMENT 'Cumulative grade point average, 6.0 to 9.5.',
  target_role STRING NOT NULL COMMENT 'The role family the student is aiming at. Matches job_roles.role_family exactly.'
) USING DELTA COMMENT 'Synthetic student population. Contains no real student records.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.student_skills (
  student_id STRING NOT NULL COMMENT 'References students.student_id.',
  skill_id STRING NOT NULL COMMENT 'References skills.skill_id.',
  proficiency STRING NOT NULL COMMENT 'beginner, intermediate or advanced.'
) USING DELTA COMMENT 'Skills a student currently holds. Sampled from their target role profile at reduced probability, which is what produces a realistic near-miss population.';

-- -------------------------------------------------------- placement history

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.companies (
  company_id STRING NOT NULL COMMENT 'Company identifier, e.g. C001.',
  name STRING NOT NULL COMMENT 'Company name.',
  sector STRING COMMENT 'Fintech, E-commerce, SaaS, AI, IT Services or Deep Tech.',
  tier STRING COMMENT 'product, growth or service.',
  campus_recruiter BOOLEAN COMMENT 'Whether the company recruits on campus.'
) USING DELTA COMMENT 'Companies that appear in historical job roles. Every job_roles.company_id resolves here.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.job_roles (
  role_id STRING NOT NULL COMMENT 'Historical role identifier, e.g. R0003.',
  company_id STRING NOT NULL COMMENT 'References companies.company_id.',
  role_family STRING NOT NULL COMMENT 'Normalised family such as Backend Engineer or ML Engineer. Join key to students.target_role.',
  year INT NOT NULL COMMENT 'Posting year, 2022 to 2026.',
  location STRING COMMENT 'City or Remote.'
) USING DELTA COMMENT 'Historical campus job postings. These are the roles a student is aligned against; they are history, not open positions.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.job_requirements (
  role_id STRING NOT NULL COMMENT 'References job_roles.role_id.',
  skill_id STRING NOT NULL COMMENT 'References skills.skill_id.',
  importance STRING NOT NULL COMMENT 'core or preferred. Core skills count double preferred ones in alignment; a query that ignores preferred skills will report no change when a student learns one.'
) USING DELTA COMMENT 'One row per skill a historical role asked for. Sampled from a per-family probability profile, so shares are uneven and meaningful.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.placement_history (
  placement_id STRING NOT NULL COMMENT 'Placement record identifier.',
  student_id STRING COMMENT 'References students.student_id. Only fourth-year students appear.',
  role_id STRING NOT NULL COMMENT 'References job_roles.role_id.',
  company_id STRING NOT NULL COMMENT 'References companies.company_id.',
  year INT NOT NULL COMMENT 'Placement year.',
  outcome STRING NOT NULL COMMENT 'placed or not_placed. Descriptive history, never a prediction.',
  package_lpa DOUBLE COMMENT 'Offered package in lakhs per annum; null when not placed.'
) USING DELTA COMMENT 'Aggregate-safe placement outcomes for fourth-year students, only against roles in their target family.';

-- ------------------------------------------------------------- opportunities

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.opportunities (
  opportunity_id STRING NOT NULL COMMENT 'Opportunity identifier, e.g. O001.',
  title STRING NOT NULL COMMENT 'Opportunity title. Always consistent with domain.',
  organization STRING COMMENT 'Host organisation or club.',
  type STRING NOT NULL COMMENT 'internship, hackathon, workshop, competition or research.',
  domain STRING NOT NULL COMMENT 'Backend, Frontend, Data, Machine Learning, DevOps, Robotics, Algorithms or Mobile.',
  deadline DATE COMMENT 'Application deadline.',
  difficulty STRING COMMENT 'intro, intermediate or advanced.'
) USING DELTA COMMENT 'Forward-looking things a student can act on. Unlike job_roles these are open, not historical.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.opportunity_skills (
  opportunity_id STRING NOT NULL COMMENT 'References opportunities.opportunity_id.',
  skill_id STRING NOT NULL COMMENT 'References skills.skill_id.'
) USING DELTA COMMENT 'Skills an opportunity builds. Joining these to a student gap lets the Radar rank by the historical frequency of the gaps an opportunity closes, rather than by keyword overlap.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.learning_resources (
  resource_id STRING NOT NULL COMMENT 'Resource identifier.',
  title STRING NOT NULL COMMENT 'Resource title.',
  provider STRING COMMENT 'NPTEL, Coursera, MIT OCW and similar.',
  resource_type STRING COMMENT 'course, tutorial, workshop or book.',
  skill_id STRING NOT NULL COMMENT 'References skills.skill_id — the skill this resource builds.',
  level STRING COMMENT 'intro, intermediate or advanced.',
  estimated_hours INT COMMENT 'Rough time commitment.',
  is_free BOOLEAN COMMENT 'Whether the resource is free to access.'
) USING DELTA COMMENT 'Concrete next steps, so every surfaced gap can be answered with something to do.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.research_area_skills (
  research_area STRING NOT NULL COMMENT 'Matches professor_research.research_area and research_projects.research_area.',
  skill_id STRING NOT NULL COMMENT 'References skills.skill_id — a skill this research area calls for.'
) USING DELTA COMMENT 'Skills each research area requires. Join through this to tell a student what a project would ask of them and which requirements they already meet.';

-- ----------------------------------------------------------------- research

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.professors (
  professor_id STRING NOT NULL COMMENT 'Professor identifier, e.g. F001.',
  name STRING NOT NULL COMMENT 'Synthetic name.',
  department STRING NOT NULL COMMENT 'CSE, ISE, ECE, EEE, ME or AIML.',
  designation STRING COMMENT 'Assistant Professor, Associate Professor or Professor.',
  accepting_students BOOLEAN COMMENT 'Whether they are currently taking on students.'
) USING DELTA COMMENT 'Synthetic faculty. Not real BMSCE staff.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.professor_research (
  professor_id STRING NOT NULL COMMENT 'References professors.professor_id.',
  research_area STRING NOT NULL COMMENT 'An area this professor actually works in.'
) USING DELTA COMMENT 'Areas a professor publishes in. Research projects are constrained to these, so a computer vision professor never surfaces with only a bioinformatics project.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.research_projects (
  project_id STRING NOT NULL COMMENT 'Project identifier.',
  professor_id STRING NOT NULL COMMENT 'References professors.professor_id.',
  title STRING NOT NULL COMMENT 'Project title.',
  research_area STRING NOT NULL COMMENT 'Always one of the professor_research areas for this professor.',
  status STRING COMMENT 'open or ongoing.',
  open_positions INT COMMENT 'Student positions available.',
  year_started INT COMMENT 'Year the project began.'
) USING DELTA COMMENT 'Lab projects a student could join. Traverse interest to research_area to professor to project.';

CREATE OR REPLACE TABLE {{catalog}}.{{schema}}.publications (
  publication_id STRING NOT NULL COMMENT 'Publication identifier.',
  professor_id STRING NOT NULL COMMENT 'References professors.professor_id.',
  title STRING NOT NULL COMMENT 'Paper title.',
  venue STRING COMMENT 'Journal, conference or workshop.',
  year INT COMMENT 'Publication year.',
  research_area STRING NOT NULL COMMENT 'Always one of the professor_research areas for this professor.'
) USING DELTA COMMENT 'Evidence that a professor works in an area — the basis for recommending them.';
