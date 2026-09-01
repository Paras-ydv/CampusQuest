-- Question: What should I learn next for my goal role?
SELECT skill_name, frequency_pct, impact_pct, role_count
FROM {{catalog}}.{{schema}}.skill_gap_view
WHERE student_id = :student_id ORDER BY impact_pct DESC, skill_name LIMIT 10;

-- Question: What changes if I learn Docker?
SELECT title, company_name, posting_year, match_pct
FROM {{catalog}}.{{schema}}.role_alignment
WHERE student_id = :student_id ORDER BY match_pct DESC, posting_year DESC LIMIT 20;

-- Question: Which open learning resources close my largest gaps?
SELECT r.title, r.provider, r.skill_name, r.level, r.estimated_hours, r.url
FROM {{catalog}}.{{schema}}.learning_resources r
JOIN {{catalog}}.{{schema}}.skill_gap_view g USING (skill_id)
WHERE g.student_id = :student_id AND r.is_open = true
ORDER BY g.impact_pct DESC, r.estimated_hours ASC;
