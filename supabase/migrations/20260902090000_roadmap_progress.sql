-- Roadmap topic progress
-- ---------------------------------------------------------------------------
-- Which roadmap.sh topics a student has worked through.
--
-- There is deliberately no table for the outlines themselves. They are derived
-- from roadmap.sh's canvas geometry, hand-corrected, and committed under
-- `apps/web/lib/roadmap/outlines/` — reviewed data belongs in the repository
-- where it can be diffed, not in a cache that silently refreshes over the
-- corrections. Topic bodies stay remote and are fetched one at a time.
--
-- IMPORTANT: ticking a subtopic is a self-report and nothing more. It never
-- promotes a skill to `user_skills.source = 'verified'`; only finishing a quest
-- with a real deliverable does that. This table records intent and progress,
-- not evidence.

create table if not exists public.user_topic_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  -- roadmap.sh slug, e.g. 'docker'. Not a FK: the catalogue lives in the repo.
  roadmap_slug text not null check (roadmap_slug ~ '^[a-z0-9][a-z0-9-]{0,62}$'),
  -- roadmap.sh node id, or 'section:<id>' for a derived heading.
  node_id text not null check (char_length(node_id) between 1 and 128),
  status text not null default 'learning' check (status in ('learning','done')),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique(user_id, roadmap_slug, node_id)
);

-- No separate index for the read path: the unique constraint above already
-- creates a btree on (user_id, roadmap_slug, node_id), and "this student, this
-- roadmap" is a leading-column prefix of it. A second index would cost every
-- write and serve nothing.

alter table public.user_topic_progress enable row level security;

-- Progress is private to its owner, and a student may only write their own.
create policy user_topic_progress_owner_read on public.user_topic_progress
  for select to authenticated using (user_id = auth.uid());
create policy user_topic_progress_owner_insert on public.user_topic_progress
  for insert to authenticated with check (user_id = auth.uid());
create policy user_topic_progress_owner_update on public.user_topic_progress
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_topic_progress_owner_delete on public.user_topic_progress
  for delete to authenticated using (user_id = auth.uid());

-- `updated_at` has to move on re-tick, otherwise "last studied" is wrong the
-- moment a student changes their mind about a topic. Reuses the shared trigger
-- function every other table in this schema uses.
create trigger user_topic_progress_updated
  before update on public.user_topic_progress
  for each row execute function public.set_updated_at();
