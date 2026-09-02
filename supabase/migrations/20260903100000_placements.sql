-- Real placement records
-- ---------------------------------------------------------------------------
-- The campus dataset in Databricks is synthetic: `students.name` is documented
-- as "Not a real person" and every placement row comes from the deterministic
-- generator. This table is where actual placement-cell records live, so the
-- placement dashboard can eventually report history rather than a simulation.
--
-- Nothing here identifies a graduate. There is no name, no roll number, no
-- email and deliberately no foreign key to `profiles` — the people in these
-- rows graduated and are not users of this product. `/placements` is visible
-- to every signed-in student, and a table that any classmate can select from
-- must not be one join away from "who did Zoho reject".

create table public.placements (
  id uuid primary key default gen_random_uuid(),

  -- An opaque, stable key for one graduate within a load: a hash or a serial
  -- assigned by whoever prepares the file, never a roll number or an email.
  --
  -- It exists because a placement rate cannot be computed without it. A
  -- student sits several company processes in a year, so rows are attempts,
  -- not people: in the synthetic set, 205 rows belong to 56 students, and
  -- placed-rows-over-total-rows reports 59% where the share of students with
  -- at least one offer is 85%. Counting distinct students is the difference
  -- between those two numbers, and null here means only the attempt-level
  -- figures can be trusted for that row.
  student_ref text check (student_ref is null or char_length(trim(student_ref)) between 1 and 64),

  company_name text not null check (char_length(trim(company_name)) between 1 and 160),
  company_sector text check (company_sector is null or char_length(trim(company_sector)) between 1 and 80),
  company_tier text check (company_tier in ('product','growth','service')),

  role_family text not null check (char_length(trim(role_family)) between 1 and 120),
  location text check (location is null or char_length(trim(location)) between 1 and 120),

  -- Branch is free text, not a check constraint. The warehouse fixes six
  -- branches because it generated them; a real placement cell will hand over
  -- whatever its own records say, and a migration that rejects "CSE (AI/ML)"
  -- is a migration someone works around.
  branch text not null check (char_length(trim(branch)) between 1 and 80),

  placement_year smallint not null check (placement_year between 2000 and 2100),
  outcome text not null check (outcome in ('placed','not_placed')),
  package_lpa numeric(6,2) check (package_lpa > 0),

  -- Where the row came from, so a partial load can be corrected without
  -- guessing which rows were hand-entered.
  source text not null default 'placement_cell' check (char_length(trim(source)) between 1 and 60),

  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),

  -- A rejection can never carry a package. The reverse is not required: real
  -- records routinely record an offer without disclosing the number, and
  -- forcing a value there would push loaders into inventing one.
  constraint placements_package_requires_offer check (outcome = 'placed' or package_lpa is null)
);

create index placements_year_idx on public.placements(placement_year);
create index placements_company_year_idx on public.placements(company_name, placement_year);
create index placements_branch_year_idx on public.placements(branch, placement_year);
create index placements_student_year_idx on public.placements(student_ref, placement_year)
  where student_ref is not null;

create trigger placements_updated before update on public.placements
  for each row execute function public.set_updated_at();

alter table public.placements enable row level security;

-- Campus-wide history, readable by every signed-in student, exactly like the
-- quest and skill catalogues. Writes are service-role only: with no insert,
-- update or delete policy, RLS refuses them for `authenticated` outright.
create policy placements_read on public.placements
  for select to authenticated using (true);

comment on table public.placements is
  'Real campus placement records. Aggregate-safe: no graduate is identifiable from any column.';
comment on column public.placements.student_ref is
  'Opaque per-graduate key used only to count distinct students. Never a roll number, name or email.';
comment on column public.placements.package_lpa is
  'Offered package in lakhs per annum. Null means undisclosed, not zero.';
