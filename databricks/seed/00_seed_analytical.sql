-- CampusQuest analytical seed, as SQL
-- ---------------------------------------------------------------------------
-- Equivalent to seed/01_seed_synthetic.py, but runnable on a SQL warehouse
-- through the Statement Execution API, so seeding needs no cluster and no
-- Faker install.
--
-- Every statement is self-contained. The Statement Execution API gives each
-- call its own session, so a temporary view created by one statement is gone
-- by the next — the reference data is therefore repeated as CTEs rather than
-- defined once.
--
-- Generation is set-based: 12 companies x 3 roles x 5 years = 180 postings.
-- Everything here is synthetic. Never load student PII into this schema.
-- Replace {{catalog}} and {{schema}} before executing.

INSERT OVERWRITE {{catalog}}.{{schema}}.companies
WITH cq_companies AS (
  SELECT format_string('cmp_%03d', pos + 1) AS company_id,
         concat(name, ' Technologies') AS company_name,
         element_at(array('Software','AI','Fintech'), (pos % 3) + 1) AS industry
  FROM (SELECT posexplode(array(
    'Nimbus','Ketu','Arka','Vayu','Tarang','Suvarna',
    'Indra','Meghna','Ravi','Chitra','Anila','Prakash')) AS (pos, name))
)
SELECT company_id, company_name, industry, 'India', true, current_timestamp()
FROM cq_companies;

INSERT OVERWRITE {{catalog}}.{{schema}}.job_postings
WITH cq_companies AS (
  SELECT format_string('cmp_%03d', pos + 1) AS company_id,
         concat(name, ' Technologies') AS company_name
  FROM (SELECT posexplode(array(
    'Nimbus','Ketu','Arka','Vayu','Tarang','Suvarna',
    'Indra','Meghna','Ravi','Chitra','Anila','Prakash')) AS (pos, name))
),
cq_roles AS (
  SELECT * FROM VALUES ('Backend Engineer'), ('AI/ML Engineer'), ('Data Engineer') AS t(role_family)
)
SELECT concat('job_', y.posting_year, '_', c.company_id, '_', replace(lower(r.role_family), ' ', '_')),
       c.company_id, c.company_name, r.role_family, r.role_family,
       concat('Synthetic ', r.role_family, ' role at ', c.company_name, '. Build reliable campus-scale systems.'),
       'India', y.posting_year, 'internship', true, current_timestamp()
FROM cq_companies c CROSS JOIN cq_roles r
CROSS JOIN (SELECT explode(sequence(2022, 2026)) AS posting_year) y;

INSERT OVERWRITE {{catalog}}.{{schema}}.job_required_skills
WITH cq_skills AS (
  SELECT * FROM VALUES
    ('python','Python'), ('sql','SQL'), ('docker','Docker'), ('kubernetes','Kubernetes'),
    ('pytorch','PyTorch'), ('systemdesign','System design'), ('spark','Apache Spark')
  AS t(skill_id, skill_name)
),
cq_roles AS (
  SELECT * FROM VALUES
    ('Backend Engineer', array('python','sql','docker','systemdesign')),
    ('AI/ML Engineer',   array('python','pytorch','docker','sql')),
    ('Data Engineer',    array('python','sql','spark','docker'))
  AS t(role_family, required_ids)
)
SELECT p.job_id, s.skill_id, s.skill_name, 1.0, 'synthetic'
FROM {{catalog}}.{{schema}}.job_postings p
JOIN cq_roles r ON r.role_family = p.role_family
JOIN cq_skills s ON array_contains(r.required_ids, s.skill_id);

-- Preferred is every skill the role does not already require.
INSERT OVERWRITE {{catalog}}.{{schema}}.job_preferred_skills
WITH cq_skills AS (
  SELECT * FROM VALUES
    ('python','Python'), ('sql','SQL'), ('docker','Docker'), ('kubernetes','Kubernetes'),
    ('pytorch','PyTorch'), ('systemdesign','System design'), ('spark','Apache Spark')
  AS t(skill_id, skill_name)
),
cq_roles AS (
  SELECT * FROM VALUES
    ('Backend Engineer', array('python','sql','docker','systemdesign')),
    ('AI/ML Engineer',   array('python','pytorch','docker','sql')),
    ('Data Engineer',    array('python','sql','spark','docker'))
  AS t(role_family, required_ids)
)
SELECT p.job_id, s.skill_id, s.skill_name, 0.5, 'synthetic'
FROM {{catalog}}.{{schema}}.job_postings p
JOIN cq_roles r ON r.role_family = p.role_family
JOIN cq_skills s ON NOT array_contains(r.required_ids, s.skill_id);

INSERT OVERWRITE {{catalog}}.{{schema}}.learning_resources
WITH cq_skills AS (
  SELECT * FROM VALUES
    ('python','Python'), ('sql','SQL'), ('docker','Docker'), ('kubernetes','Kubernetes'),
    ('pytorch','PyTorch'), ('systemdesign','System design'), ('spark','Apache Spark')
  AS t(skill_id, skill_name)
)
SELECT concat('res_', skill_id), concat('Learn ', skill_name), 'CampusQuest Open',
       'course', CAST(NULL AS STRING), skill_id, skill_name, 'intro', 6.0, true, 'synthetic'
FROM cq_skills;

-- Aggregated outcomes only: a cohort label, never an individual student.
INSERT OVERWRITE {{catalog}}.{{schema}}.placement_outcomes
SELECT concat('out_', p.posting_year, '_', p.company_id, '_', replace(lower(p.role_family), ' ', '_')),
       concat('CSE ', p.posting_year), p.company_id, p.role_family, p.posting_year,
       CASE WHEN (p.posting_year + length(p.company_id)) % 4 = 0 THEN 'not_placed' ELSE 'placed' END,
       element_at(array('6-10 LPA','10-16 LPA','16-24 LPA'), (p.posting_year % 3) + 1),
       'synthetic'
FROM {{catalog}}.{{schema}}.job_postings p;

-- Skill-to-role edges: the shape the constellation reads.
INSERT OVERWRITE {{catalog}}.{{schema}}.skill_graph
WITH cq_skills AS (
  SELECT * FROM VALUES
    ('python','Python'), ('sql','SQL'), ('docker','Docker'), ('kubernetes','Kubernetes'),
    ('pytorch','PyTorch'), ('systemdesign','System design'), ('spark','Apache Spark')
  AS t(skill_id, skill_name)
),
cq_roles AS (
  SELECT * FROM VALUES
    ('Backend Engineer', array('python','sql','docker','systemdesign')),
    ('AI/ML Engineer',   array('python','pytorch','docker','sql')),
    ('Data Engineer',    array('python','sql','spark','docker'))
  AS t(role_family, required_ids)
)
SELECT concat('edge_', s.skill_id, '_', replace(lower(r.role_family), ' ', '_')),
       s.skill_id, 'skill', r.role_family, 'role', 'required_by', 1.0, 'synthetic'
FROM cq_roles r JOIN cq_skills s ON array_contains(r.required_ids, s.skill_id);

-- Synthetic analytical students so role_alignment and skill_gap_view return
-- rows before the Supabase profile-sync job has ever run. No PII by design.
INSERT OVERWRITE {{catalog}}.{{schema}}.students_analytical
SELECT format_string('stu_%03d', id) AS student_id,
       element_at(array('Backend Engineer','AI/ML Engineer','Data Engineer'), ((id - 1) % 3) + 1),
       CAST(((id - 1) % 4) + 1 AS INT),
       array('Machine learning','Distributed systems'),
       slice(array('python','sql','docker','pytorch','spark'), 1, ((id - 1) % 4) + 1),
       slice(array('Python','SQL','Docker','PyTorch','Apache Spark'), 1, ((id - 1) % 4) + 1),
       CAST((id - 1) % 5 AS INT), CAST((id - 1) % 3 AS INT),
       CAST(id * 120 AS INT), CAST(floor(id * 120 / 350) + 1 AS INT),
       current_timestamp(), current_timestamp()
FROM (SELECT explode(sequence(1, 24)) AS id);
