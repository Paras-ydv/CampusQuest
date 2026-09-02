-- Persist the progressive quest catalog used by the application. Every path
-- reuses one repository across its three levels; only its capstone grants the
-- path skill through quest_skills.
-- Migrations run before seed.sql, so ensure every referenced vocabulary entry
-- exists on fresh deployments as well as populated local databases.
insert into public.skills (id, name, category) values
  ('docker','Docker','infra'), ('systemdesign','System design','systems'),
  ('pytorch','PyTorch','ml'), ('git','Git','tooling'), ('sql','SQL','data'),
  ('postgres','PostgreSQL','data'), ('pandas','Pandas','ml'), ('numpy','NumPy','ml'),
  ('java','Java','language'), ('aws','AWS','infra'), ('javascript','JavaScript','language'),
  ('react','React','framework'), ('sklearn','scikit-learn','ml'),
  ('llmapps','LLM applications','ml'), ('rag','Retrieval-augmented generation','ml'),
  ('aievals','AI evaluation','ml'), ('mlops','MLOps','ml'),
  ('kubernetes','Kubernetes','infra'), ('terraform','Terraform','infra'), ('cicd','CI/CD','infra'),
  ('observability','Observability','infra'), ('appsec','Application security','practice'),
  ('testautomation','Test automation','practice'), ('dbt','dbt','data'),
  ('dataviz','Data visualization','data')
on conflict (id) do update set name = excluded.name, category = excluded.category;

do $$
declare
  path record;
  level integer;
  quest_id text;
  labels text[];
begin
  for path in
    select * from (values
      ('docker','Docker','infra',array['Backend Engineer','Cloud Engineer','MLOps Engineer']),
      ('systemdesign','System design','systems',array['Backend Engineer','Full-stack Engineer']),
      ('pytorch','PyTorch','ml',array['AI Engineer','Data Scientist']),
      ('git','Git','tooling',array['Software Engineer','Full-stack Engineer']),
      ('sql','SQL','data',array['Data Scientist','Analytics Engineer']),
      ('postgres','PostgreSQL','data',array['Backend Engineer','Data Engineer']),
      ('pandas','Pandas','ml',array['Data Scientist','Analytics Engineer']),
      ('numpy','NumPy','ml',array['AI Engineer','Data Scientist']),
      ('java','Java','language',array['Backend Engineer','Software Engineer']),
      ('aws','AWS','infra',array['Cloud Engineer','MLOps Engineer']),
      ('javascript','JavaScript','language',array['Full-stack Engineer','Frontend Engineer']),
      ('react','React','framework',array['Full-stack Engineer','Frontend Engineer']),
      ('sklearn','scikit-learn','ml',array['AI Engineer','Data Scientist']),
      ('llmapps','LLM applications','ml',array['AI Engineer']),
      ('rag','Retrieval-augmented generation','ml',array['AI Engineer','Data Scientist']),
      ('aievals','AI evaluation','ml',array['AI Engineer','MLOps Engineer']),
      ('mlops','MLOps','ml',array['MLOps Engineer','AI Engineer']),
      ('kubernetes','Kubernetes','infra',array['Cloud Engineer','MLOps Engineer','Site Reliability Engineer']),
      ('terraform','Terraform','infra',array['Cloud Engineer','MLOps Engineer']),
      ('cicd','CI/CD','infra',array['Cloud Engineer','MLOps Engineer','Full-stack Engineer']),
      ('observability','Observability','infra',array['Site Reliability Engineer','Cloud Engineer','MLOps Engineer']),
      ('appsec','Application security','practice',array['Cybersecurity Engineer','Full-stack Engineer']),
      ('testautomation','Test automation','practice',array['Full-stack Engineer','Cybersecurity Engineer']),
      ('dbt','dbt','data',array['Analytics Engineer','Data Scientist']),
      ('dataviz','Data visualization','data',array['Analytics Engineer','Data Scientist'])
    ) as paths(skill_id, skill_name, skill_category, goal_roles)
  loop
    for level in 1..3 loop
      quest_id := format('q_%s_l%s', path.skill_id, level);
      labels := case level
        when 1 then array[
          format('Create a reproducible %s project repository', path.skill_name),
          format('Configure dependencies and a local %s environment', path.skill_name),
          format('Build a small working %s exercise', path.skill_name),
          'Add an implementation, notebook, or configuration artifact',
          'Document setup and results in the README'
        ]
        when 2 then array[
          format('Implement a realistic %s use case', path.skill_name),
          'Add automated tests or an evaluation artifact',
          'Measure and report quality, performance, or reliability',
          'Document technical trade-offs and limitations',
          'Publish a runnable usage example'
        ]
        else array[
          format('Build an end-to-end %s portfolio project', path.skill_name),
          'Add production-oriented quality checks',
          'Add automated tests',
          'Document results and limitations',
          'Write a complete project README',
          'Pass the GitHub Actions workflow'
        ]
      end;

      insert into public.quests (id, title, summary, category, rarity, difficulty, xp, estimated_hours, goal_roles, why_template, path_skill_id, path_level, prerequisite_quest_id)
      values (
        quest_id,
        format('%s: %s', path.skill_name, case level when 1 then 'Foundation' when 2 then 'Applied practice' else 'Portfolio capstone' end),
        format('Verified %s milestone for %s.', case level when 1 then 'foundation' when 2 then 'applied practice' else 'portfolio capstone' end, path.skill_name),
        'learn', case level when 1 then 'common' when 2 then 'rare' else 'legendary' end,
        case level when 1 then 'intro' when 2 then 'intermediate' else 'advanced' end,
        case level when 1 then 60 when 2 then 100 else 160 end,
        case level when 1 then 4 when 2 then 7 else 12 end,
        path.goal_roles, format('%s is a tracked skill gap for %s.', path.skill_name, array_to_string(path.goal_roles, ', ')),
        path.skill_id, level, case when level = 1 then null else format('q_%s_l%s', path.skill_id, level - 1) end
      )
      on conflict (id) do update set title = excluded.title, summary = excluded.summary, rarity = excluded.rarity, difficulty = excluded.difficulty, xp = excluded.xp, estimated_hours = excluded.estimated_hours, goal_roles = excluded.goal_roles, why_template = excluded.why_template, path_skill_id = excluded.path_skill_id, path_level = excluded.path_level, prerequisite_quest_id = excluded.prerequisite_quest_id;

      insert into public.quest_steps (id, quest_id, label, sort_order, verification_type)
      select format('%s_s%s', quest_id, item.ordinality), quest_id, item.label, item.ordinality - 1,
        case when item.label = 'Pass the GitHub Actions workflow' then 'github_workflow' else 'github_file' end
      from unnest(labels) with ordinality as item(label, ordinality)
      on conflict (id) do update set label = excluded.label, sort_order = excluded.sort_order, verification_type = excluded.verification_type;

      if level = 3 then
        insert into public.quest_skills (quest_id, skill_id) values (quest_id, path.skill_id) on conflict do nothing;
      end if;
    end loop;
  end loop;
end $$;
