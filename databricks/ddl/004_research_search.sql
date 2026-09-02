-- A Delta Sync source table for Databricks AI Search. It deliberately contains
-- only the existing synthetic research graph; no summaries or abstracts are
-- invented during indexing.
CREATE TABLE IF NOT EXISTS {{catalog}}.{{schema}}.research_search_documents (
  project_id STRING NOT NULL,
  search_text STRING NOT NULL,
  research_area STRING NOT NULL,
  department STRING NOT NULL,
  status STRING,
  open_positions INT,
  accepting_students BOOLEAN,
  skill_slugs ARRAY<STRING>
) USING DELTA
TBLPROPERTIES (delta.enableChangeDataFeed = true)
COMMENT 'One searchable document per research project for Databricks AI Search.';

INSERT OVERWRITE {{catalog}}.{{schema}}.research_search_documents
WITH lead_areas AS (
  SELECT professor_id, sort_array(collect_set(research_area)) AS areas
  FROM {{catalog}}.{{schema}}.professor_research
  GROUP BY professor_id
), area_skills AS (
  SELECT ras.research_area,
         sort_array(collect_set(s.slug)) AS skill_slugs,
         sort_array(collect_set(s.name)) AS skill_names
  FROM {{catalog}}.{{schema}}.research_area_skills ras
  JOIN {{catalog}}.{{schema}}.skills s ON s.skill_id = ras.skill_id
  GROUP BY ras.research_area
), area_publications AS (
  SELECT professor_id, research_area,
         sort_array(collect_set(concat(title, ' (', coalesce(venue, 'publication'), ')'))) AS publications
  FROM {{catalog}}.{{schema}}.publications
  GROUP BY professor_id, research_area
)
SELECT p.project_id,
       concat_ws('\n',
         concat('Research project: ', p.title),
         concat('Research area: ', p.research_area),
         concat('Department: ', f.department),
         concat('Lead designation: ', coalesce(f.designation, 'Professor')),
         concat('Required skills: ', coalesce(array_join(sk.skill_names, ', '), '')),
         concat('Professor research areas: ', coalesce(array_join(la.areas, ', '), '')),
         concat('Related publications: ', coalesce(array_join(pb.publications, '; '), ''))
       ) AS search_text,
       p.research_area,
       f.department,
       p.status,
       coalesce(p.open_positions, 0) AS open_positions,
       coalesce(f.accepting_students, false) AS accepting_students,
       coalesce(sk.skill_slugs, array()) AS skill_slugs
FROM {{catalog}}.{{schema}}.research_projects p
JOIN {{catalog}}.{{schema}}.professors f ON f.professor_id = p.professor_id
LEFT JOIN lead_areas la ON la.professor_id = f.professor_id
LEFT JOIN area_skills sk ON sk.research_area = p.research_area
LEFT JOIN area_publications pb ON pb.professor_id = f.professor_id AND pb.research_area = p.research_area;
