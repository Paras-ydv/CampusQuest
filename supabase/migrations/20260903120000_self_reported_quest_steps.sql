-- Let a student tick a quest step off themselves.
--
-- `complete_quest` required every technical step to carry `verified_at`, which
-- only the GitHub verifier sets. With no repository connected that made every
-- skill-path quest impossible to finish, so XP never moved and the Journey
-- screen sat at whatever the seed left it on. Verification stays the stronger
-- claim and stays mapped on every step; self-reporting is now an accepted, and
-- visibly weaker, second route.
alter table public.user_quest_steps
  add column if not exists self_reported_at timestamptz;

comment on column public.user_quest_steps.self_reported_at is
  'Set when the student marked the step done themselves. Never set by the verifier — verified_at is the proved claim, and the UI distinguishes the two.';

-- Marks a step done without proof. Deliberately refuses to touch verified_at:
-- self-reporting must not be able to forge a verification.
create or replace function public.self_report_quest_step(p_quest_id text, p_step_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_progress public.user_quests%rowtype;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from public.quest_steps where id = p_step_id and quest_id = p_quest_id) then
    raise exception 'step does not belong to that quest';
  end if;

  insert into public.user_quests(user_id, quest_id, status) values (v_user, p_quest_id, 'active')
    on conflict on constraint user_quests_user_id_quest_id_key do nothing;
  select uq.* into v_progress from public.user_quests uq
    where uq.user_id = v_user and uq.quest_id = p_quest_id;

  insert into public.user_quest_steps(user_quest_id, quest_step_id, self_reported_at)
  values (v_progress.id, p_step_id, timezone('utc', now()))
  on conflict (user_quest_id, quest_step_id)
    do update set self_reported_at = coalesce(public.user_quest_steps.self_reported_at, timezone('utc', now()));
end $$;

grant execute on function public.self_report_quest_step(text, text) to authenticated;

-- Undo, so a mis-tap is not permanent. Only clears the self-reported claim.
create or replace function public.clear_quest_step(p_quest_id text, p_step_id text)
returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  update public.user_quest_steps uqs set self_reported_at = null
  where uqs.quest_step_id = p_step_id
    and uqs.user_quest_id in (
      select id from public.user_quests where user_id = v_user and quest_id = p_quest_id
    );
end $$;

grant execute on function public.clear_quest_step(text, text) to authenticated;

-- Completion now accepts either route, and still requires every step.
create or replace function public.complete_quest(p_quest_id text)
returns table(quest_id text, xp_awarded integer, xp integer, level integer, leveled_up boolean, completed_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_quest public.quests%rowtype; v_progress public.user_quests%rowtype; v_profile public.profiles%rowtype; v_old_level integer;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  select * into v_quest from public.quests where id = p_quest_id;
  if not found then raise exception 'quest not found'; end if;
  if v_quest.is_retired then raise exception 'quest has been replaced by a progressive skill path'; end if;
  insert into public.user_quests(user_id,quest_id,status) values(v_user,p_quest_id,'active')
    on conflict on constraint user_quests_user_id_quest_id_key do nothing;
  select uq.* into v_progress from public.user_quests uq where uq.user_id = v_user and uq.quest_id = p_quest_id for update;
  select p.* into v_profile from public.profiles p where p.id = v_user for update;
  if v_progress.status = 'completed' then
    return query select p_quest_id, v_progress.xp_awarded, v_profile.xp, v_profile.level, false, v_progress.completed_at;
    return;
  end if;

  -- Every step must be accounted for; proof is preferred but not required.
  if exists (
    select 1 from public.quest_steps qs
    where qs.quest_id = p_quest_id
      and qs.verification_type in ('github_file','github_workflow')
      and not exists (
        select 1 from public.user_quest_steps uqs
        where uqs.user_quest_id = v_progress.id
          and uqs.quest_step_id = qs.id
          and (uqs.verified_at is not null or uqs.self_reported_at is not null)
      )
  ) then raise exception 'every quest step must be verified or marked done'; end if;

  v_old_level := v_profile.level;
  update public.profiles p set xp = p.xp + v_quest.xp, level = floor((p.xp + v_quest.xp)::numeric / 350)::integer + 1 where p.id = v_user returning p.* into v_profile;
  update public.user_quests set status='completed', completed_at=timezone('utc',now()), xp_awarded=v_quest.xp where id=v_progress.id returning * into v_progress;
  insert into public.user_skills(user_id,skill_id,proficiency,source)
    select v_user,qs.skill_id,'learning','quest' from public.quest_skills qs where qs.quest_id=p_quest_id
    on conflict(user_id,skill_id) do update set source=case when public.user_skills.source='verified' then 'verified' else 'quest' end, updated_at=timezone('utc',now());
  insert into public.user_activities(user_id,activity_type,payload) values(v_user,'quest_completed',jsonb_build_object('quest_id',p_quest_id,'xp_awarded',v_quest.xp,'completed_at',v_progress.completed_at));
  return query select p_quest_id, v_quest.xp, v_profile.xp, v_profile.level, v_profile.level > v_old_level, v_progress.completed_at;
end $$;
