-- Question: Which skills appear most often in historical backend and software engineering roles?
SELECT s.name AS skill, COUNT(DISTINCT r.role_id) AS roles_requiring,
       ROUND(100.0 * COUNT(DISTINCT r.role_id) / (SELECT COUNT(*) FROM {{catalog}}.{{schema}}.job_roles WHERE role_family IN ('Backend Engineer','Software Engineer')), 0) AS share_pct
FROM {{catalog}}.{{schema}}.job_requirements r
JOIN {{catalog}}.{{schema}}.job_roles j USING (role_id)
JOIN {{catalog}}.{{schema}}.skills s USING (skill_id)
WHERE j.role_family IN ('Backend Engineer','Software Engineer')
GROUP BY s.name ORDER BY roles_requiring DESC LIMIT 10;

-- Question: How many historical roles does this student align with?
SELECT COUNT(*) AS aligned_roles
FROM {{catalog}}.{{schema}}.role_alignment
WHERE student_id = :student_id AND aligned;

-- Question: What should I learn next for my goal role?
SELECT skill_name, frequency_pct, impact_pct, role_count
FROM {{catalog}}.{{schema}}.skill_gap_view
WHERE student_id = :student_id
ORDER BY impact_pct DESC, skill_name LIMIT 10;

-- Question: What happens to my alignment if I learn Docker?
WITH held AS (
  SELECT array_union(collect_set(skill_id), array((SELECT skill_id FROM {{catalog}}.{{schema}}.skills WHERE slug = 'docker'))) AS skills
  FROM {{catalog}}.{{schema}}.student_skills WHERE student_id = :student_id
), weight AS (
  SELECT role_id, SUM(weight) AS total_weight FROM {{catalog}}.{{schema}}.role_requirement_weight GROUP BY role_id
)
SELECT COUNT(*) AS aligned_after
FROM (
  SELECT w.role_id, SUM(CASE WHEN array_contains((SELECT skills FROM held), w.skill_id) THEN w.weight ELSE 0 END) AS covered, MAX(t.total_weight) AS total_weight
  FROM {{catalog}}.{{schema}}.role_requirement_weight w JOIN weight t USING (role_id) GROUP BY w.role_id
) WHERE covered >= 0.5 * total_weight;

-- Question: Which opportunities close the gaps that matter most for me?
SELECT o.title, o.type, o.organization, o.deadline,
       collect_set(g.skill_name) AS closes,
       SUM(g.impact_pct) AS evidence_score
FROM {{catalog}}.{{schema}}.opportunities o
JOIN {{catalog}}.{{schema}}.opportunity_skills os USING (opportunity_id)
JOIN {{catalog}}.{{schema}}.skill_gap_view g ON g.skill_id = os.skill_id AND g.student_id = :student_id
GROUP BY o.opportunity_id, o.title, o.type, o.organization, o.deadline
ORDER BY evidence_score DESC LIMIT 10;

-- Question: I'm interested in computer vision and robotics - who should I approach?
SELECT p.name AS professor, p.department, pr.research_area, rp.title AS open_project, rp.open_positions
FROM {{catalog}}.{{schema}}.professors p
JOIN {{catalog}}.{{schema}}.professor_research pr USING (professor_id)
LEFT JOIN {{catalog}}.{{schema}}.research_projects rp
  ON rp.professor_id = p.professor_id AND rp.research_area = pr.research_area AND rp.status = 'open'
WHERE pr.research_area IN ('Computer Vision','Robotics') AND p.accepting_students
ORDER BY rp.open_positions DESC NULLS LAST;

-- Question: Which open learning resources close my largest gaps?
SELECT l.title, l.provider, l.skill_id, l.level, l.estimated_hours
FROM {{catalog}}.{{schema}}.learning_resources l
JOIN {{catalog}}.{{schema}}.skill_gap_view g USING (skill_id)
WHERE g.student_id = :student_id AND l.is_free
ORDER BY g.impact_pct DESC, l.estimated_hours ASC LIMIT 10;
