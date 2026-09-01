-- CampusQuest — queries to run live in the Databricks SQL editor
-- ---------------------------------------------------------------------------
-- Each one is self-contained: paste and run, no parameters to set. They are
-- ordered as a narrative — what the data says, what it means for one student,
-- and what the student should do about it.

-- ===========================================================================
-- 1. What campus hiring actually asked for
-- ===========================================================================
-- The credibility opener. Note the shape: a decaying curve, no ties at the top,
-- nothing at 100%. Real hiring data is never unanimous, and a column of round
-- numbers is the first thing that reads as fabricated.
SELECT
  s.name                                                        AS skill,
  COUNT(DISTINCT r.role_id)                                     AS roles_requiring,
  ROUND(100.0 * COUNT(DISTINCT r.role_id) / (
    SELECT COUNT(*) FROM workspace.campusquest.job_roles
    WHERE role_family IN ('Backend Engineer','Software Engineer')), 0) AS share_pct
FROM workspace.campusquest.job_requirements r
JOIN workspace.campusquest.job_roles  j USING (role_id)
JOIN workspace.campusquest.skills     s USING (skill_id)
WHERE j.role_family IN ('Backend Engineer','Software Engineer')
GROUP BY s.name
ORDER BY roles_requiring DESC
LIMIT 8;


-- ===========================================================================
-- 2. The alignment rule, and what one skill is worth
-- ===========================================================================
-- A profile aligns with a role when it holds at least 50% of that role's
-- requirement weight, where a *core* skill counts double a *preferred* one.
--
-- This is the query to run when someone asks whether the What-If engine is
-- real. It shows alignment before, alignment after, and how many additional
-- roles the student would newly match — computed, not asserted.
WITH student AS (
  SELECT student_id, target_role,
         collect_set(sk.slug) AS held
  FROM workspace.campusquest.students s
  JOIN workspace.campusquest.student_skills ss USING (student_id)
  JOIN workspace.campusquest.skills sk USING (skill_id)
  WHERE s.student_id = 'S0004'
  GROUP BY student_id, target_role
),
scoped AS (
  SELECT w.role_id, w.skill_slug, w.weight
  FROM workspace.campusquest.role_requirement_weight w
  JOIN workspace.campusquest.job_roles j USING (role_id)
  JOIN student st ON j.role_family = st.target_role
),
coverage AS (
  SELECT
    role_id,
    SUM(weight) AS total_weight,
    SUM(CASE WHEN array_contains((SELECT held FROM student), skill_slug)
             THEN weight ELSE 0 END) AS held_now,
    SUM(CASE WHEN array_contains((SELECT held FROM student), skill_slug)
              OR skill_slug = 'docker'
             THEN weight ELSE 0 END) AS held_with_docker
  FROM scoped
  GROUP BY role_id
)
SELECT
  (SELECT target_role FROM student)                                   AS target_role,
  COUNT(*)                                                            AS historical_roles,
  ROUND(AVG(100.0 * held_now        / total_weight), 0)               AS alignment_now_pct,
  ROUND(AVG(100.0 * held_with_docker/ total_weight), 0)               AS alignment_with_docker_pct,
  SUM(CASE WHEN held_now         >= 0.5 * total_weight THEN 1 ELSE 0 END) AS aligned_now,
  SUM(CASE WHEN held_with_docker >= 0.5 * total_weight THEN 1 ELSE 0 END) AS aligned_with_docker
FROM coverage;


-- ===========================================================================
-- 3. Opportunities ranked by placement evidence, for one student
-- ===========================================================================
-- Not keyword matching. Each opportunity is weighted by how much of the target
-- family's total requirement weight the gaps it closes actually carry, so the
-- ranking is driven by what employers asked for.
--
-- Note the per-student filter. Without it this aggregates all 221 students and
-- produces scores in the thousands that mean nothing for any individual.
WITH me AS (SELECT 'S0004' AS student_id)
SELECT
  o.title,
  o.type,
  o.deadline,
  collect_set(g.skill_name)              AS closes_these_gaps,
  ROUND(SUM(g.impact_pct), 1)            AS evidence_score
FROM workspace.campusquest.opportunities o
JOIN workspace.campusquest.opportunity_skills os USING (opportunity_id)
JOIN workspace.campusquest.skill_gap_view g
  ON g.skill_id = os.skill_id
 AND g.student_id = (SELECT student_id FROM me)
GROUP BY o.opportunity_id, o.title, o.type, o.deadline
ORDER BY evidence_score DESC
LIMIT 5;


-- ===========================================================================
-- 4. Research matchmaking, end to end
-- ===========================================================================
-- interest -> research area -> professor -> open project -> published evidence.
-- A project only ever appears under an area its professor genuinely works in.
-- The paper count can still be zero: 60 publications spread across 25
-- professors do not cover every professor-and-area pair, and a lab with an open
-- position but nothing published in that area yet is a real situation.
SELECT
  pr.research_area,
  p.name                       AS professor,
  p.department,
  rp.title                     AS open_project,
  rp.open_positions,
  COUNT(pb.publication_id)     AS papers_in_this_area
FROM workspace.campusquest.professors p
JOIN workspace.campusquest.professor_research pr USING (professor_id)
JOIN workspace.campusquest.research_projects  rp
  ON rp.professor_id = p.professor_id
 AND rp.research_area = pr.research_area
LEFT JOIN workspace.campusquest.publications pb
  ON pb.professor_id = p.professor_id
 AND pb.research_area = pr.research_area
WHERE pr.research_area IN ('Computer Vision','Robotics')
  AND rp.status = 'open'
  AND p.accepting_students
GROUP BY pr.research_area, p.name, p.department, rp.title, rp.open_positions
ORDER BY rp.open_positions DESC, papers_in_this_area DESC
LIMIT 6;
