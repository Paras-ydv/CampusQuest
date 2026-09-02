-- App-facing skills for the current-market paths. The Databricks warehouse
-- intentionally remains unchanged; it continues to analyse its own vocabulary.
insert into public.skills (id, name, category) values
  ('llmapps', 'LLM applications', 'ml'),
  ('rag', 'Retrieval-augmented generation', 'ml'),
  ('aievals', 'AI evaluation', 'ml'),
  ('observability', 'Observability', 'infra'),
  ('appsec', 'Application security', 'practice'),
  ('testautomation', 'Test automation', 'practice'),
  ('dbt', 'dbt', 'data'),
  ('dataviz', 'Data visualization', 'data')
on conflict (id) do update set name = excluded.name, category = excluded.category;
