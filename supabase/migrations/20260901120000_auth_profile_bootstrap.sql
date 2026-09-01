-- Auth bootstrap
-- ---------------------------------------------------------------------------
-- public.profiles is keyed by auth.users(id), but nothing was creating the row.
-- A user who signed in through OAuth therefore had a session and no profile,
-- and every RLS-scoped read returned empty.
--
-- This trigger fills in only what the identity provider gives us. Onboarding
-- still owns branch, academic_year, goal_role and interests; goal_role staying
-- empty is what the callback route reads to decide who needs onboarding.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  resolved_email text := coalesce(nullif(new.email, ''), new.id::text || '@unknown.invalid');
  resolved_name text;
  resolved_initials text;
begin
  resolved_name := coalesce(
    nullif(trim(meta ->> 'full_name'), ''),
    nullif(trim(meta ->> 'name'), ''),
    nullif(split_part(resolved_email, '@', 1), ''),
    'Student'
  );
  -- The column is checked at exactly two characters, so pad short names.
  resolved_initials := upper(rpad(left(regexp_replace(resolved_name, '[^a-zA-Z]', '', 'g'), 2), 2, 'X'));

  insert into public.profiles (id, email, name, initials, avatar_url)
  values (
    new.id,
    resolved_email,
    left(resolved_name, 120),
    resolved_initials,
    nullif(trim(coalesce(meta ->> 'avatar_url', meta ->> 'picture', '')), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

-- Only the trigger should ever run this; it is security definer.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
