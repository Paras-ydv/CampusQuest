-- CampusQuest Person 3 v1 foundation.  This migration is deliberately
-- self-contained so `supabase db reset` produces a usable local database.
create extension if not exists pgcrypto;
create extension if not exists vector;

create or replace function public.set_updated_at()
returns trigger language plpgsql security invoker set search_path = public as $$
begin new.updated_at = timezone('utc', now()); return new; end;
$$;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  name text not null check (char_length(trim(name)) between 1 and 120),
  initials text not null check (char_length(initials) = 2),
  avatar_url text,
  branch text not null default '',
  academic_year smallint not null default 1 check (academic_year between 1 and 5),
  goal_role text not null default '',
  interests text[] not null default '{}',
  wants_to_learn text[] not null default '{}',
  collaboration_intent text,
  looking_for_team boolean not null default false,
  xp integer not null default 0 check (xp >= 0),
  level integer not null default 1 check (level >= 1),
  alignment_pct numeric(5,2) not null default 0 check (alignment_pct between 0 and 100),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (level = floor(xp::numeric / 350)::integer + 1)
);

create table public.skills (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9_-]{0,62}$'),
  name text not null unique,
  category text not null check (category in ('language','framework','infra','data','ml','systems','tooling','practice')),
  created_at timestamptz not null default timezone('utc', now())
);

-- `wants_to_learn` is an array for the profile API. A trigger below validates
-- its individual values against `skills`, since PostgreSQL cannot FK array
-- elements directly.

create table public.user_skills (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete restrict,
  proficiency text not null check (proficiency in ('learning','working','strong')),
  source text not null check (source in ('self','quest','verified')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, skill_id)
);
create index user_skills_user_idx on public.user_skills(user_id, skill_id);

create table public.user_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 180),
  summary text not null default '' check (char_length(summary) <= 5000),
  skill_ids text[] not null default '{}',
  url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, title)
);
create index user_projects_user_idx on public.user_projects(user_id);

create table public.user_certifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 240),
  issuer text not null check (char_length(trim(issuer)) between 1 and 160),
  earned_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, title, issuer)
);
create index user_certifications_user_idx on public.user_certifications(user_id);

create table public.user_activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  activity_type text not null check (activity_type in ('quest_completed','profile_updated','connection_created','message_sent')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);
create index user_activities_user_created_idx on public.user_activities(user_id, created_at desc);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  user_a_id uuid not null references public.profiles(id) on delete cascade,
  user_b_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check (user_a_id < user_b_id),
  unique(user_a_id, user_b_id)
);
create index connections_a_idx on public.connections(user_a_id);
create index connections_b_idx on public.connections(user_b_id);

create table public.connection_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  message text check (char_length(message) <= 400),
  status text not null default 'pending' check (status in ('pending','accepted','rejected','cancelled')),
  created_at timestamptz not null default timezone('utc', now()),
  responded_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  check (requester_id <> recipient_id),
  unique(requester_id, recipient_id)
);
create index connection_requests_recipient_idx on public.connection_requests(recipient_id, status);
create index connection_requests_requester_idx on public.connection_requests(requester_id, status);

create table public.quests (
  id text primary key check (id ~ '^q_[a-z0-9_-]+$'),
  title text not null unique,
  summary text not null,
  category text not null check (category in ('build','learn','compete','contribute','research','connect')),
  rarity text not null check (rarity in ('common','rare','epic','legendary')),
  difficulty text not null check (difficulty in ('intro','intermediate','advanced')),
  xp integer not null check (xp > 0),
  estimated_hours numeric(7,2) not null check (estimated_hours > 0),
  goal_roles text[] not null default '{}',
  why_template text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index quests_difficulty_idx on public.quests(difficulty);
create table public.quest_steps (
  id text primary key,
  quest_id text not null references public.quests(id) on delete cascade,
  label text not null,
  sort_order integer not null check (sort_order >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  unique(quest_id, sort_order)
);
create table public.quest_skills (
  quest_id text not null references public.quests(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  primary key(quest_id, skill_id)
);
create index quest_skills_skill_idx on public.quest_skills(skill_id);
create table public.user_quests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  quest_id text not null references public.quests(id) on delete cascade,
  status text not null default 'available' check (status in ('available','active','completed')),
  completed_at timestamptz,
  xp_awarded integer not null default 0 check (xp_awarded >= 0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, quest_id),
  check ((status = 'completed') = (completed_at is not null))
);
create index user_quests_user_status_idx on public.user_quests(user_id, status);

create table public.threads (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'direct' check (kind in ('direct','group')),
  direct_key text unique,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  check ((kind = 'direct' and direct_key is not null) or (kind = 'group'))
);
create table public.thread_members (
  thread_id uuid not null references public.threads(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key(thread_id, user_id)
);
create index thread_members_user_idx on public.thread_members(user_id, thread_id);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  edited_at timestamptz,
  check (edited_at is null or edited_at >= created_at)
);
create index messages_thread_created_idx on public.messages(thread_id, created_at desc, id desc);

create table public.saved_opportunities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  opportunity_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, opportunity_id)
);
create table public.opportunity_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 100),
  filters jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index opportunity_alerts_user_idx on public.opportunity_alerts(user_id);

create table public.embeddings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  entity_type text not null check (entity_type in ('profile','project','research_project','publication')),
  entity_id text not null,
  model text not null,
  canonical_text text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  embedding vector(1024) not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(entity_type, entity_id, model, content_hash)
);
create index embeddings_entity_idx on public.embeddings(entity_type, entity_id);
create index embeddings_vector_hnsw_idx on public.embeddings using hnsw (embedding vector_cosine_ops) with (m = 16, ef_construction = 64);

create table public.genie_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index genie_conversations_user_idx on public.genie_conversations(user_id, updated_at desc);
create table public.genie_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.genie_conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);
create index genie_messages_conversation_idx on public.genie_messages(conversation_id, created_at);

create or replace function public.validate_profile_skill_arrays()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from unnest(new.wants_to_learn) skill where not exists (select 1 from public.skills where id = skill)) then
    raise exception 'wants_to_learn contains an unknown skill';
  end if;
  return new;
end; $$;
create trigger profiles_validate_skills before insert or update of wants_to_learn on public.profiles for each row execute function public.validate_profile_skill_arrays();

create or replace function public.normalize_connection_request()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status in ('accepted','rejected') and old.status = 'pending' then new.responded_at = timezone('utc', now()); end if;
  if new.status = 'accepted' and old.status <> 'accepted' then
    insert into public.connections(user_a_id,user_b_id) values (least(new.requester_id,new.recipient_id), greatest(new.requester_id,new.recipient_id)) on conflict do nothing;
  end if;
  return new;
end; $$;
create or replace function public.guard_connection_request_update()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if auth.uid() = old.recipient_id then
    if new.requester_id <> old.requester_id or new.recipient_id <> old.recipient_id or new.message is distinct from old.message or new.status not in ('accepted','rejected') then
      raise exception 'recipient may only accept or reject a request';
    end if;
  elsif auth.uid() = old.requester_id then
    if new.requester_id <> old.requester_id or new.recipient_id <> old.recipient_id or new.message is distinct from old.message or new.status <> 'cancelled' then
      raise exception 'requester may only cancel a request';
    end if;
  else
    raise exception 'not a request participant';
  end if;
  if old.status <> 'pending' then raise exception 'request has already been resolved'; end if;
  return new;
end; $$;
create trigger connection_requests_guard before update on public.connection_requests for each row execute function public.guard_connection_request_update();
create trigger connection_requests_status before update on public.connection_requests for each row execute function public.normalize_connection_request();

create or replace function public.complete_quest(p_quest_id text)
returns table(quest_id text, xp_awarded integer, xp integer, level integer, leveled_up boolean, completed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_quest public.quests%rowtype; v_progress public.user_quests%rowtype; v_profile public.profiles%rowtype; v_old_level integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_quest from public.quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;
  insert into public.user_quests(user_id,quest_id,status) values(v_user,p_quest_id,'active')
    on conflict on constraint user_quests_user_id_quest_id_key do nothing;
  select uq.* into v_progress from public.user_quests uq where uq.user_id = v_user and uq.quest_id = p_quest_id for update;
  select p.* into v_profile from public.profiles p where p.id = v_user for update;
  if v_progress.status = 'completed' then
    return query select p_quest_id, v_progress.xp_awarded, v_profile.xp, v_profile.level, false, v_progress.completed_at;
    return;
  end if;
  v_old_level := v_profile.level;
  update public.profiles p
    set xp = p.xp + v_quest.xp,
        level = floor((p.xp + v_quest.xp)::numeric / 350)::integer + 1
    where p.id = v_user
    returning p.* into v_profile;
  update public.user_quests set status='completed', completed_at=timezone('utc',now()), xp_awarded=v_quest.xp where id=v_progress.id returning * into v_progress;
  insert into public.user_skills(user_id,skill_id,proficiency,source)
    select v_user,qs.skill_id,'learning','quest' from public.quest_skills qs where qs.quest_id=p_quest_id
    on conflict(user_id,skill_id) do update set source=case when public.user_skills.source='verified' then 'verified' else 'quest' end, updated_at=timezone('utc',now());
  insert into public.user_activities(user_id,activity_type,payload) values(v_user,'quest_completed',jsonb_build_object('quest_id',p_quest_id,'xp_awarded',v_quest.xp,'completed_at',v_progress.completed_at));
  return query select p_quest_id, v_quest.xp, v_profile.xp, v_profile.level, v_profile.level > v_old_level, v_progress.completed_at;
end; $$;
revoke all on function public.complete_quest(text) from public;
grant execute on function public.complete_quest(text) to authenticated;

create or replace function public.match_embeddings(p_embedding vector(1024), p_entity_type text, p_exclude_id text, p_limit integer default 50)
returns table(entity_id text, similarity double precision)
language sql stable security definer set search_path = public as $$
  select e.entity_id, 1 - (e.embedding <=> p_embedding) as similarity
  from public.embeddings e
  where e.entity_type = p_entity_type and e.entity_id <> p_exclude_id
  order by e.embedding <=> p_embedding asc limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.match_embeddings(vector,text,text,integer) from public;
grant execute on function public.match_embeddings(vector,text,text,integer) to service_role;

create or replace function public.create_direct_thread(p_other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_key text;
begin
  if v_me is null or v_me = p_other_user_id then raise exception 'invalid direct thread members'; end if;
  if not exists(select 1 from public.profiles where id=p_other_user_id) then raise exception 'profile not found'; end if;
  v_key := least(v_me::text,p_other_user_id::text) || ':' || greatest(v_me::text,p_other_user_id::text);
  insert into public.threads(kind,direct_key,created_by) values('direct',v_key,v_me) on conflict(direct_key) do update set updated_at=public.threads.updated_at returning id into v_id;
  insert into public.thread_members(thread_id,user_id) values(v_id,v_me),(v_id,p_other_user_id) on conflict do nothing;
  return v_id;
end; $$;
revoke all on function public.create_direct_thread(uuid) from public;
grant execute on function public.create_direct_thread(uuid) to authenticated;

-- Timestamp triggers.
create trigger profiles_updated before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_skills_updated before update on public.user_skills for each row execute function public.set_updated_at();
create trigger user_projects_updated before update on public.user_projects for each row execute function public.set_updated_at();
create trigger user_certifications_updated before update on public.user_certifications for each row execute function public.set_updated_at();
create trigger connections_updated before update on public.connections for each row execute function public.set_updated_at();
create trigger connection_requests_updated before update on public.connection_requests for each row execute function public.set_updated_at();
create trigger quests_updated before update on public.quests for each row execute function public.set_updated_at();
create trigger user_quests_updated before update on public.user_quests for each row execute function public.set_updated_at();
create trigger threads_updated before update on public.threads for each row execute function public.set_updated_at();
create trigger messages_updated before update on public.messages for each row execute function public.set_updated_at();
create trigger saved_opportunities_updated before update on public.saved_opportunities for each row execute function public.set_updated_at();
create trigger opportunity_alerts_updated before update on public.opportunity_alerts for each row execute function public.set_updated_at();
create trigger embeddings_updated before update on public.embeddings for each row execute function public.set_updated_at();
create trigger genie_conversations_updated before update on public.genie_conversations for each row execute function public.set_updated_at();
create trigger genie_messages_updated before update on public.genie_messages for each row execute function public.set_updated_at();

-- Row-level security: no browser policy performs cross-user matching.
-- This SECURITY DEFINER predicate prevents a recursive policy evaluation when
-- a member checks membership in the same `thread_members` table.
create or replace function public.is_thread_member(p_thread_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.thread_members where thread_id = p_thread_id and user_id = auth.uid());
$$;
revoke all on function public.is_thread_member(uuid) from public;
grant execute on function public.is_thread_member(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.skills enable row level security;
alter table public.user_skills enable row level security;
alter table public.user_projects enable row level security;
alter table public.user_certifications enable row level security;
alter table public.user_activities enable row level security;
alter table public.connections enable row level security;
alter table public.connection_requests enable row level security;
alter table public.quests enable row level security;
alter table public.quest_steps enable row level security;
alter table public.quest_skills enable row level security;
alter table public.user_quests enable row level security;
alter table public.threads enable row level security;
alter table public.thread_members enable row level security;
alter table public.messages enable row level security;
alter table public.saved_opportunities enable row level security;
alter table public.opportunity_alerts enable row level security;
alter table public.embeddings enable row level security;
alter table public.genie_conversations enable row level security;
alter table public.genie_messages enable row level security;

create policy profiles_owner on public.profiles for all to authenticated using (id=auth.uid()) with check (id=auth.uid());
-- RLS establishes ownership; column privileges keep XP/level server-controlled.
revoke update on public.profiles from authenticated;
grant update (email,name,initials,avatar_url,branch,academic_year,goal_role,interests,wants_to_learn,collaboration_intent,looking_for_team) on public.profiles to authenticated;
create policy skills_read on public.skills for select to authenticated using (true);
create policy user_skills_owner on public.user_skills for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy user_projects_owner on public.user_projects for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy user_certifications_owner on public.user_certifications for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy user_activities_owner_read on public.user_activities for select to authenticated using (user_id=auth.uid());
create policy connections_participants_read on public.connections for select to authenticated using (user_a_id=auth.uid() or user_b_id=auth.uid());
create policy connection_requests_participants_read on public.connection_requests for select to authenticated using (requester_id=auth.uid() or recipient_id=auth.uid());
create policy connection_requests_send on public.connection_requests for insert to authenticated with check (requester_id=auth.uid() and recipient_id<>auth.uid() and status='pending');
create policy connection_requests_recipient_update on public.connection_requests for update to authenticated using (recipient_id=auth.uid()) with check (recipient_id=auth.uid());
create policy connection_requests_requester_cancel on public.connection_requests for update to authenticated using (requester_id=auth.uid()) with check (requester_id=auth.uid() and status='cancelled');
create policy quests_read on public.quests for select to authenticated using (true);
create policy quest_steps_read on public.quest_steps for select to authenticated using (true);
create policy quest_skills_read on public.quest_skills for select to authenticated using (true);
create policy user_quests_owner_read on public.user_quests for select to authenticated using (user_id=auth.uid());
create policy user_quests_owner_start on public.user_quests for insert to authenticated with check (user_id=auth.uid() and status in ('available','active') and xp_awarded=0 and completed_at is null);
create policy thread_members_read on public.thread_members for select to authenticated using (public.is_thread_member(thread_id));
create policy threads_members_read on public.threads for select to authenticated using (public.is_thread_member(id));
create policy messages_members_read on public.messages for select to authenticated using (public.is_thread_member(thread_id));
create policy messages_members_send on public.messages for insert to authenticated with check (sender_id=auth.uid() and public.is_thread_member(thread_id));
create policy saved_opportunities_owner on public.saved_opportunities for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy opportunity_alerts_owner on public.opportunity_alerts for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy embeddings_owner on public.embeddings for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy genie_conversations_owner on public.genie_conversations for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy genie_messages_owner on public.genie_messages for all to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

-- Realtime uses the same SELECT policy as regular queries for authorization.
alter publication supabase_realtime add table public.messages;
