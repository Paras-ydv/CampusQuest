-- Alignment and gap views over the fourteen-table dataset
-- ---------------------------------------------------------------------------
-- The alignment rule is weighted coverage: a core skill counts double a
-- preferred one, and a profile aligns with a historical role when it holds at
-- least 50% of that role's requirement weight.
--
-- This matters more than it looks. An earlier rule counted core skills only,
-- so "what if I learn Docker?" returned the same number before and after —
-- Docker is preferred in most backend postings. The flagship interaction of
-- the product did nothing. Any change here should be checked against that
-- question before it ships.

-- The first deployment created job_postings, job_required_skills and
-- job_preferred_skills as tables; they are views now, and CREATE OR REPLACE
-- VIEW cannot replace a table. The other three are superseded by the
-- fourteen-table dataset. Dropping them is not just tidiness: Genie's SQL
-- accuracy degrades as schema surface grows, and a leftover table with
-- overlapping column names is exactly what it joins by mistake.
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.job_postings;
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.job_required_skills;
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.job_preferred_skills;
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.students_analytical;
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.skill_graph;
DROP TABLE IF EXISTS {{catalog}}.{{schema}}.placement_outcomes;

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.role_requirement_weight AS
SELECT
  r.role_id,
  r.skill_id,
  s.slug AS skill_slug,
  s.name AS skill_name,
  r.importance,
  CASE r.importance WHEN 'core' THEN 2 ELSE 1 END AS weight
FROM {{catalog}}.{{schema}}.job_requirements r
JOIN {{catalog}}.{{schema}}.skills s USING (skill_id);

-- One row per (student, role): how much of that role's requirement weight the
-- student already holds, and whether that clears the 50% alignment bar.
CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.role_alignment AS
WITH role_weight AS (
  SELECT role_id, SUM(weight) AS total_weight
  FROM {{catalog}}.{{schema}}.role_requirement_weight
  GROUP BY role_id
),
held AS (
  SELECT w.role_id, ss.student_id, SUM(w.weight) AS held_weight
  FROM {{catalog}}.{{schema}}.role_requirement_weight w
  JOIN {{catalog}}.{{schema}}.student_skills ss ON ss.skill_id = w.skill_id
  GROUP BY w.role_id, ss.student_id
)
SELECT
  s.student_id,
  j.role_id,
  j.role_family,
  j.role_family AS title,
  c.name AS company_name,
  j.year,
  COALESCE(h.held_weight, 0) AS held_weight,
  rw.total_weight,
  ROUND(100.0 * COALESCE(h.held_weight, 0) / GREATEST(rw.total_weight, 1), 0) AS match_pct,
  (COALESCE(h.held_weight, 0) >= 0.5 * rw.total_weight) AS aligned
FROM {{catalog}}.{{schema}}.students s
CROSS JOIN {{catalog}}.{{schema}}.job_roles j
JOIN {{catalog}}.{{schema}}.companies c ON c.company_id = j.company_id
JOIN role_weight rw ON rw.role_id = j.role_id
LEFT JOIN held h ON h.role_id = j.role_id AND h.student_id = s.student_id;

-- Per-student skill gaps within their target role family. `frequency_pct` is
-- how often the family asked for the skill; `impact_pct` is the alignment
-- points the student would gain by learning it, so the two differ and ranking
-- by impact is meaningful.
CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.skill_gap_view AS
WITH scoped AS (
  SELECT s.student_id, s.target_role, j.role_id
  FROM {{catalog}}.{{schema}}.students s
  JOIN {{catalog}}.{{schema}}.job_roles j ON j.role_family = s.target_role
),
family_size AS (
  SELECT student_id, COUNT(DISTINCT role_id) AS role_count FROM scoped GROUP BY student_id
),
role_weight AS (
  SELECT role_id, SUM(weight) AS total_weight
  FROM {{catalog}}.{{schema}}.role_requirement_weight GROUP BY role_id
)
SELECT
  sc.student_id,
  w.skill_id,
  MAX(w.skill_name) AS skill_name,
  ROUND(100.0 * COUNT(DISTINCT w.role_id) / GREATEST(MAX(fs.role_count), 1), 0) AS frequency_pct,
  -- Mean share of requirement weight this one skill would add across the family.
  ROUND(100.0 * SUM(w.weight) / GREATEST(SUM(rw.total_weight), 1), 0) AS impact_pct,
  MAX(fs.role_count) AS role_count
FROM scoped sc
JOIN {{catalog}}.{{schema}}.role_requirement_weight w ON w.role_id = sc.role_id
JOIN role_weight rw ON rw.role_id = sc.role_id
JOIN family_size fs ON fs.student_id = sc.student_id
WHERE NOT EXISTS (
  SELECT 1 FROM {{catalog}}.{{schema}}.student_skills ss
  WHERE ss.student_id = sc.student_id AND ss.skill_id = w.skill_id
)
GROUP BY sc.student_id, w.skill_id;

-- ------------------------------------------------------- compatibility layer
-- The application still queries `job_postings` and `job_required_skills` by
-- name. These views keep it working against the new schema unchanged.
--
-- Note that job_required_skills deliberately exposes core AND preferred rows.
-- The app's current match calculation is unweighted, so restricting this to
-- core would reproduce the dead-demo bug: learning a preferred-only skill such
-- as Kubernetes would move the number by exactly zero. The `importance` column
-- is carried through for when the app moves onto role_alignment above.

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.job_postings AS
SELECT
  j.role_id AS job_id,
  j.role_family AS title,
  c.name AS company_name,
  j.role_family,
  j.year AS posting_year,
  j.location,
  true AS campus
FROM {{catalog}}.{{schema}}.job_roles j
JOIN {{catalog}}.{{schema}}.companies c ON c.company_id = j.company_id;

-- skill_id here is the application's slug, not the SK-number: the app holds
-- Supabase skill ids and intersects them against this column directly.
CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.job_required_skills AS
SELECT role_id AS job_id, skill_slug AS skill_id, skill_name, importance, weight
FROM {{catalog}}.{{schema}}.role_requirement_weight;

CREATE OR REPLACE VIEW {{catalog}}.{{schema}}.job_preferred_skills AS
SELECT role_id AS job_id, skill_slug AS skill_id, skill_name, weight
FROM {{catalog}}.{{schema}}.role_requirement_weight
WHERE importance = 'preferred';
