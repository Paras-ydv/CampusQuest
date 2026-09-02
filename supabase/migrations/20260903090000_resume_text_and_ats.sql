-- Résumé text and ATS evaluations
-- ---------------------------------------------------------------------------
-- Onboarding parses an uploaded PDF and throws it away. That is the right
-- default — the file is personal data the app has no standing use for — but it
-- means the ATS screen cannot score a résumé the student has already given us.
--
-- What is kept here is the extracted *text*, never the PDF: it is what every
-- downstream reader actually needs, it carries no embedded metadata, and a
-- student can clear it without the app losing anything it cannot re-derive.
--
-- Both tables are one row per student. A résumé is replaced, not versioned:
-- keeping a history would turn this into a record of how someone's CV changed
-- over time, which is a different product with different consent.

create table if not exists public.user_resumes (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- Extracted text, not the source file. Bounded to keep a pathological
  -- upload from becoming a pathological row.
  content text not null check (char_length(content) between 1 and 200000),
  -- Shown back to the student so they know which document is being scored.
  file_name text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_resumes enable row level security;

-- A résumé is private to its owner. There is deliberately no policy granting
-- anyone else read access: peer matching, research and the radar must never be
-- able to join on this.
create policy user_resumes_owner_read on public.user_resumes
  for select to authenticated using (user_id = auth.uid());
create policy user_resumes_owner_insert on public.user_resumes
  for insert to authenticated with check (user_id = auth.uid());
create policy user_resumes_owner_update on public.user_resumes
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_resumes_owner_delete on public.user_resumes
  for delete to authenticated using (user_id = auth.uid());

create trigger user_resumes_updated
  before update on public.user_resumes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------

create table if not exists public.user_ats_scores (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  -- 0-120: four weighted categories plus bonuses, less deductions. Stored as
  -- the model returned it, clamped by the application before it lands here.
  overall integer not null check (overall between 0 and 120),
  -- Per-category scores, evidence, strengths and improvements. Kept as jsonb
  -- rather than columns because the rubric's shape belongs to the evaluator,
  -- not to the schema: adding a category should not need a migration.
  detail jsonb not null,
  -- The résumé this score describes. A score whose résumé has since changed is
  -- stale, and comparing this to user_resumes.updated_at is how that is known.
  scored_at timestamptz not null default timezone('utc', now())
);

alter table public.user_ats_scores enable row level security;

create policy user_ats_scores_owner_read on public.user_ats_scores
  for select to authenticated using (user_id = auth.uid());
create policy user_ats_scores_owner_insert on public.user_ats_scores
  for insert to authenticated with check (user_id = auth.uid());
create policy user_ats_scores_owner_update on public.user_ats_scores
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy user_ats_scores_owner_delete on public.user_ats_scores
  for delete to authenticated using (user_id = auth.uid());
