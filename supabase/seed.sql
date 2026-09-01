-- Repeatable local data. All seed accounts use password `campusquest-demo`.
insert into public.skills(id,name,category) values
('python','Python','language'),('typescript','TypeScript','language'),('cpp','C++','language'),('sql','SQL','data'),('react','React','framework'),('nextjs','Next.js','framework'),('fastapi','FastAPI','framework'),('node','Node.js','framework'),('pytorch','PyTorch','ml'),('sklearn','scikit-learn','ml'),('transformers','Transformers','ml'),('mlops','MLOps','ml'),('docker','Docker','infra'),('kubernetes','Kubernetes','infra'),('aws','AWS','infra'),('cicd','CI/CD','infra'),('linux','Linux','systems'),('systemdesign','System design','systems'),('distributed','Distributed systems','systems'),('dsa','Data structures & algorithms','practice'),('rest','REST APIs','practice'),('git','Git','tooling'),('postgres','PostgreSQL','data'),('spark','Spark','data'),('embedded','Embedded systems','systems'),('cv','Computer vision','ml'),('ros','ROS','systems'),('figma','Figma','tooling')
on conflict (id) do update set name=excluded.name, category=excluded.category;

-- GoTrue scans these token columns into Go strings, so they must be '' and
-- never NULL. A hand-inserted row that leaves them NULL makes every sign-in
-- fail with "Database error querying schema".
insert into auth.users (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at,confirmation_token,recovery_token,email_change,email_change_token_new,email_change_token_current,phone_change,phone_change_token,reauthentication_token)
values
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000001','authenticated','authenticated','kartikeya@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000002','authenticated','authenticated','aarav@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000003','authenticated','authenticated','meera@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000004','authenticated','authenticated','dev@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000005','authenticated','authenticated','ishita@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000006','authenticated','authenticated','rohan@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','',''),
('00000000-0000-0000-0000-000000000000','10000000-0000-0000-0000-000000000007','authenticated','authenticated','sara@campus.edu',crypt('campusquest-demo',gen_salt('bf')),now(),'{}','{}',now(),now(),'','','','','','','','')
on conflict (id) do update set email=excluded.email, updated_at=now(), confirmation_token='', recovery_token='', email_change='', email_change_token_new='', email_change_token_current='', phone_change='', phone_change_token='', reauthentication_token='';

insert into public.profiles(id,email,name,initials,branch,academic_year,goal_role,interests,wants_to_learn,collaboration_intent,looking_for_team,xp,level,alignment_pct) values
('10000000-0000-0000-0000-000000000001','kartikeya@campus.edu','Kartikeya','KG','Computer Science',3,'AI/ML Engineer',array['Machine learning','Distributed systems','Robotics','Open source'],array['docker','systemdesign','kubernetes'],'Hackathon and research collaborators',true,2340,7,62),
('10000000-0000-0000-0000-000000000002','aarav@campus.edu','Aarav Sharma','AS','Electronics',3,'Robotics Engineer',array['Robotics','Machine learning'],array['pytorch'],'A hackathon team for Smart India Hackathon',true,1120,4,55),
('10000000-0000-0000-0000-000000000003','meera@campus.edu','Meera Raghavan','MR','Computer Science',4,'Computer Vision Engineer',array['Machine learning','Open source'],array['systemdesign'],'A collaborator for a CVPR workshop submission',true,1600,5,72),
('10000000-0000-0000-0000-000000000004','dev@campus.edu','Dev Patel','DP','Computer Science',3,'Product Engineer',array['Open source','Product design'],array['python'],'A backend partner for a campus product',true,910,3,61),
('10000000-0000-0000-0000-000000000005','ishita@campus.edu','Ishita Nair','IN','Computer Science',4,'Platform Engineer',array['Distributed systems'],array['pytorch'],'Someone to co-run a Kubernetes reading group',true,1980,6,74),
('10000000-0000-0000-0000-000000000006','rohan@campus.edu','Rohan Verma','RV','Mathematics',2,'Research Scientist',array['Machine learning'],array['fastapi'],'A reading partner for probabilistic ML',true,400,2,69),
('10000000-0000-0000-0000-000000000007','sara@campus.edu','Sara Fernandes','SF','Electronics',3,'Hardware Engineer',array['Robotics'],array['pytorch'],'A software partner for a drone build',true,1080,4,48)
-- The signup trigger (handle_new_user) has already created this row from the
-- auth.users insert above, with xp/level/alignment at their defaults. The
-- update list must therefore cover the progress columns too, or every seeded
-- profile silently stays at level 1.
on conflict (id) do update set name=excluded.name, branch=excluded.branch, academic_year=excluded.academic_year, goal_role=excluded.goal_role, interests=excluded.interests, wants_to_learn=excluded.wants_to_learn, collaboration_intent=excluded.collaboration_intent, looking_for_team=excluded.looking_for_team, xp=excluded.xp, level=excluded.level, alignment_pct=excluded.alignment_pct;

insert into public.user_skills(user_id,skill_id,proficiency,source) values
('10000000-0000-0000-0000-000000000001','python','strong','verified'),('10000000-0000-0000-0000-000000000001','pytorch','working','quest'),('10000000-0000-0000-0000-000000000001','sql','working','self'),('10000000-0000-0000-0000-000000000001','react','working','quest'),('10000000-0000-0000-0000-000000000001','fastapi','working','self'),('10000000-0000-0000-0000-000000000001','rest','strong','quest'),('10000000-0000-0000-0000-000000000001','git','strong','verified'),('10000000-0000-0000-0000-000000000001','linux','working','self'),('10000000-0000-0000-0000-000000000001','sklearn','working','self'),('10000000-0000-0000-0000-000000000001','dsa','working','verified'),
('10000000-0000-0000-0000-000000000002','embedded','strong','verified'),('10000000-0000-0000-0000-000000000002','ros','working','self'),('10000000-0000-0000-0000-000000000002','cpp','working','self'),
('10000000-0000-0000-0000-000000000003','cv','strong','verified'),('10000000-0000-0000-0000-000000000003','transformers','strong','quest'),('10000000-0000-0000-0000-000000000003','docker','working','self'),
('10000000-0000-0000-0000-000000000004','figma','strong','self'),('10000000-0000-0000-0000-000000000004','nextjs','working','self'),('10000000-0000-0000-0000-000000000004','typescript','working','self'),
('10000000-0000-0000-0000-000000000005','kubernetes','strong','verified'),('10000000-0000-0000-0000-000000000005','aws','working','self'),('10000000-0000-0000-0000-000000000005','cicd','working','self'),
('10000000-0000-0000-0000-000000000006','spark','working','self'),('10000000-0000-0000-0000-000000000006','sql','strong','verified'),
('10000000-0000-0000-0000-000000000007','embedded','strong','verified'),('10000000-0000-0000-0000-000000000007','cpp','working','self')
on conflict(user_id,skill_id) do update set proficiency=excluded.proficiency,source=excluded.source;

insert into public.user_projects(user_id,title,summary,skill_ids) values
('10000000-0000-0000-0000-000000000001','Campus notes search','Semantic search over four semesters of lecture notes.','{python,fastapi,transformers}'),
('10000000-0000-0000-0000-000000000001','Attendance vision tool','Face-recognition attendance prototype on a Raspberry Pi.','{python,cv,linux}')
on conflict do nothing;
insert into public.user_certifications(user_id,title,issuer,earned_at) values ('10000000-0000-0000-0000-000000000001','Deep Learning Specialization','DeepLearning.AI','2025-07-14T00:00:00Z') on conflict do nothing;

insert into public.quests(id,title,summary,category,rarity,difficulty,xp,estimated_hours,goal_roles,why_template) values
('q_docker','Dockerize your backend project','Containerise the campus notes search API, add Compose with Postgres, and publish the image.','build','epic','intermediate',120,6,array['AI/ML Engineer','Backend Engineer','Platform Engineer'],'Docker is a high-impact gap for your target roles.'),
('q_sysdesign','Design and write up a rate limiter','Design a distributed rate limiter and document its trade-offs.','learn','rare','intermediate',90,4,array['Backend Engineer','AI/ML Engineer'],'System design improves your role alignment.'),
('q_oss','Land a PyTorch good-first-issue','Pick a PyTorch starter issue and carry it through review.','contribute','legendary','advanced',220,14,array['AI/ML Engineer'],'Portfolio evidence strengthens your ML journey.'),
('q_sql','Tune three slow queries','Profile and improve the slowest queries in your API.','build','common','intro',60,3,array['Backend Engineer','Data Engineer'],'Query tuning makes an existing strength more useful.'),
('q_team','Form a hackathon team of three','Recruit two complementary students and register your team.','connect','rare','intermediate',80,2,array['Product Engineer','AI/ML Engineer'],'A complementary team makes the next build possible.')
on conflict(id) do update set title=excluded.title,summary=excluded.summary,category=excluded.category,rarity=excluded.rarity,difficulty=excluded.difficulty,xp=excluded.xp,estimated_hours=excluded.estimated_hours,goal_roles=excluded.goal_roles,why_template=excluded.why_template;
insert into public.quest_steps(id,quest_id,label,sort_order) values
('q_docker_s1','q_docker','Write a multi-stage Dockerfile',0),('q_docker_s2','q_docker','Add docker-compose with Postgres',1),('q_docker_s3','q_docker','Push the image and document the run',2),
('q_sysdesign_s1','q_sysdesign','Sketch the token-bucket design',0),('q_sysdesign_s2','q_sysdesign','Write the failure-mode section',1),
('q_oss_s1','q_oss','Claim an open good-first-issue',0),('q_oss_s2','q_oss','Open the pull request',1),('q_oss_s3','q_oss','Get it merged',2),
('q_sql_s1','q_sql','Capture the slow query log',0),('q_sql_s2','q_sql','Add and measure indexes',1),
('q_team_s1','q_team','Send three connection requests',0),('q_team_s2','q_team','Agree on a problem statement',1),('q_team_s3','q_team','Register the team',2)
on conflict(id) do update set label=excluded.label,sort_order=excluded.sort_order;
insert into public.quest_skills(quest_id,skill_id) values ('q_docker','docker'),('q_sysdesign','systemdesign'),('q_oss','pytorch'),('q_oss','git'),('q_sql','sql'),('q_sql','postgres') on conflict do nothing;
insert into public.user_quests(user_id,quest_id,status) values ('10000000-0000-0000-0000-000000000001','q_docker','active'),('10000000-0000-0000-0000-000000000001','q_team','active') on conflict(user_id,quest_id) do nothing;

insert into public.connection_requests(requester_id,recipient_id,message,status) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','Interested in your CV work','pending') on conflict(requester_id,recipient_id) do nothing;
insert into public.connections(user_a_id,user_b_id) values ('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004') on conflict do nothing;

-- Deterministic placeholder vectors. They must not be all-zero: pgvector's
-- cosine distance against a zero-norm vector is NaN, which propagates through
-- the match score and makes GET /api/people/matches fail schema validation.
-- Values are derived from the canonical text so the seed stays repeatable.
insert into public.embeddings(user_id,entity_type,entity_id,model,canonical_text,content_hash,embedding)
select p.id, 'profile', p.id::text, 'local-deterministic-v1', c.canonical,
       encode(digest(c.canonical,'sha256'),'hex'),
       (select array_agg(
          (get_byte(digest(c.canonical || ':' || (i / 32)::text, 'sha256'), i % 32)::real - 127.5) / 127.5
          order by i)
        from generate_series(0, 1023) as i)::vector
from public.profiles p
cross join lateral (
  select lower(p.name||' '||p.goal_role||' '||array_to_string(p.interests,' ')||' '||array_to_string(p.wants_to_learn,' ')) as canonical
) c
on conflict(entity_type,entity_id,model,content_hash) do nothing;

-- A real persisted thread and Genie history give UI/API developers immediate data.
insert into public.threads(id,kind,direct_key,created_by) values ('20000000-0000-0000-0000-000000000001','direct','10000000-0000-0000-0000-000000000001:10000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001') on conflict(id) do nothing;
insert into public.thread_members(thread_id,user_id) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001'),('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004') on conflict do nothing;
insert into public.messages(id,thread_id,sender_id,body) values ('40000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','I can help with the API layer for the hackathon.') on conflict do nothing;
insert into public.genie_conversations(id,user_id,title) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','First career plan') on conflict(id) do nothing;
insert into public.genie_messages(conversation_id,user_id,role,content) values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','user','What should I learn next?'),('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','assistant','Docker is the highest-impact deterministic gap.') on conflict do nothing;
