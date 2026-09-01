-- Badges
-- ---------------------------------------------------------------------------
-- A deliberately small achievement system: a fixed catalogue and a per-user
-- award table. Criteria are evaluated in application code against data that
-- already exists (completed quests, earned skills, accepted connections, saved
-- opportunities), so a badge can only be earned by actually doing the thing.
--
-- Awards are idempotent: re-evaluating never duplicates or revokes.

create table if not exists public.badges (
  id text primary key check (id ~ '^b_[a-z0-9_]+$'),
  name text not null,
  description text not null,
  -- What the criterion counts, so the UI can render progress honestly.
  metric text not null check (metric in ('quests_completed','skills_earned','connections','opportunities_saved')),
  threshold integer not null check (threshold > 0),
  sort_order integer not null default 0
);

create table if not exists public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_id text not null references public.badges(id) on delete cascade,
  awarded_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, badge_id)
);

create index if not exists user_badges_user_idx on public.user_badges(user_id);

alter table public.badges enable row level security;
alter table public.user_badges enable row level security;

-- The catalogue is public to signed-in users; awards are private to their owner.
create policy badges_read on public.badges
  for select to authenticated using (true);
create policy user_badges_owner_read on public.user_badges
  for select to authenticated using (user_id = auth.uid());
create policy user_badges_owner_insert on public.user_badges
  for insert to authenticated with check (user_id = auth.uid());

insert into public.badges(id,name,description,metric,threshold,sort_order) values
  ('b_first_quest','First Quest','Completed your first quest.','quests_completed',1,1),
  ('b_skill_builder','Skill Builder','Earned three skills through quests.','skills_earned',3,2),
  ('b_quest_master','Quest Master','Completed five quests.','quests_completed',5,3),
  ('b_team_player','Team Player','Made your first connection.','connections',1,4),
  ('b_opportunity_hunter','Opportunity Hunter','Saved three opportunities.','opportunities_saved',3,5)
on conflict (id) do update set
  name=excluded.name, description=excluded.description,
  metric=excluded.metric, threshold=excluded.threshold, sort_order=excluded.sort_order;
