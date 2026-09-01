-- Run with Databricks SQL or as a notebook cell after replacing {{catalog}} and {{schema}}.
-- All tables are Unity Catalog Delta tables used by the CampusQuest Genie Agent.
CREATE SCHEMA IF NOT EXISTS {{catalog}}.{{schema}};

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.companies (
  company_id STRING NOT NULL, company_name STRING NOT NULL, industry STRING,
  headquarters STRING, campus_partner BOOLEAN, created_at TIMESTAMP NOT NULL
) USING DELTA COMMENT 'Synthetic and curated companies that recruit on campus.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.job_postings (
  job_id STRING NOT NULL, company_id STRING NOT NULL, company_name STRING NOT NULL,
  title STRING NOT NULL, role_family STRING NOT NULL, description STRING,
  location STRING, posting_year INT NOT NULL, employment_type STRING,
  campus BOOLEAN NOT NULL, created_at TIMESTAMP NOT NULL
) USING DELTA COMMENT 'Historical and synthetic campus-relevant job postings.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.job_required_skills (
  job_id STRING NOT NULL, skill_id STRING NOT NULL, skill_name STRING NOT NULL,
  importance DOUBLE NOT NULL, source STRING NOT NULL
) USING DELTA COMMENT 'One required skill per job posting.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.job_preferred_skills (
  job_id STRING NOT NULL, skill_id STRING NOT NULL, skill_name STRING NOT NULL,
  importance DOUBLE NOT NULL, source STRING NOT NULL
) USING DELTA COMMENT 'One preferred, non-blocking skill per job posting.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.placement_outcomes (
  outcome_id STRING NOT NULL, student_cohort STRING NOT NULL, company_id STRING,
  role_family STRING, placement_year INT NOT NULL, outcome STRING NOT NULL,
  salary_band STRING, source STRING NOT NULL
) USING DELTA COMMENT 'Aggregated or responsibly synthetic placement outcomes; never raw student PII.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.skill_graph (
  edge_id STRING NOT NULL, from_id STRING NOT NULL, from_kind STRING NOT NULL,
  to_id STRING NOT NULL, to_kind STRING NOT NULL, relation STRING NOT NULL,
  weight DOUBLE NOT NULL, evidence_source STRING NOT NULL
) USING DELTA COMMENT 'Skill-to-skill, skill-to-role, and skill-to-technology relationships.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.learning_resources (
  resource_id STRING NOT NULL, title STRING NOT NULL, provider STRING NOT NULL,
  resource_type STRING NOT NULL, url STRING, skill_id STRING NOT NULL,
  skill_name STRING NOT NULL, level STRING NOT NULL, estimated_hours DOUBLE,
  is_open BOOLEAN NOT NULL, source STRING NOT NULL
) USING DELTA COMMENT 'Curated open and institutional learning resources.';

CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.students_analytical (
  student_id STRING NOT NULL, goal_role STRING, academic_year INT,
  interests ARRAY<STRING>, skill_ids ARRAY<STRING>, skill_names ARRAY<STRING>,
  project_count INT, certification_count INT, xp INT, level INT,
  profile_updated_at TIMESTAMP, synced_at TIMESTAMP NOT NULL
) USING DELTA COMMENT 'Minimal Supabase-derived analytical profile. Contains no email, name, or free-form project content.';

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.role_alignment AS
WITH role_skills AS (
  SELECT p.job_id, p.title, p.company_name, p.role_family, p.posting_year,
         collect_set(r.skill_id) AS required_skill_ids, collect_set(r.skill_name) AS required_skill_names
  FROM {{catalog}}.{{schema}}.job_postings p
  JOIN {{catalog}}.{{schema}}.job_required_skills r USING (job_id)
  GROUP BY p.job_id, p.title, p.company_name, p.role_family, p.posting_year
)
SELECT s.student_id, rs.job_id, rs.title, rs.company_name, rs.role_family, rs.posting_year,
       rs.required_skill_ids, rs.required_skill_names,
       ROUND(100.0 * SIZE(ARRAY_INTERSECT(rs.required_skill_ids, s.skill_ids)) / GREATEST(SIZE(rs.required_skill_ids), 1), 0) AS match_pct
FROM {{catalog}}.{{schema}}.students_analytical s CROSS JOIN role_skills rs;

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.skill_gap_view AS
WITH scoped AS (
  SELECT a.student_id, a.goal_role, a.skill_ids, p.job_id
  FROM {{catalog}}.{{schema}}.students_analytical a
  JOIN {{catalog}}.{{schema}}.job_postings p ON lower(p.role_family) = lower(a.goal_role)
), total AS (SELECT student_id, COUNT(DISTINCT job_id) role_count FROM scoped GROUP BY student_id)
SELECT s.student_id, r.skill_id, MAX(r.skill_name) skill_name,
       ROUND(100.0 * COUNT(DISTINCT r.job_id) / GREATEST(MAX(t.role_count), 1), 0) frequency_pct,
       ROUND(100.0 * COUNT(DISTINCT r.job_id) / GREATEST(MAX(t.role_count), 1), 0) impact_pct,
       MAX(t.role_count) role_count
FROM scoped s JOIN {{catalog}}.{{schema}}.job_required_skills r USING (job_id)
JOIN total t ON t.student_id = s.student_id
WHERE NOT ARRAY_CONTAINS(s.skill_ids, r.skill_id)
GROUP BY s.student_id, r.skill_id;
