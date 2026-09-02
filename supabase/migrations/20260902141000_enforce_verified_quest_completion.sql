-- The API checks verified steps, but this guard belongs in the RPC as well:
-- authenticated clients can otherwise call complete_quest directly.
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
  if exists (select 1 from public.quest_steps qs where qs.quest_id = p_quest_id and qs.verification_type in ('github_file','github_workflow') and not exists (
    select 1 from public.user_quest_steps uqs where uqs.user_quest_id = v_progress.id and uqs.quest_step_id = qs.id and uqs.verified_at is not null
  )) then raise exception 'all technical quest steps must be verified'; end if;
  v_old_level := v_profile.level;
  update public.profiles p set xp = p.xp + v_quest.xp, level = floor((p.xp + v_quest.xp)::numeric / 350)::integer + 1 where p.id = v_user returning p.* into v_profile;
  update public.user_quests set status='completed', completed_at=timezone('utc',now()), xp_awarded=v_quest.xp where id=v_progress.id returning * into v_progress;
  insert into public.user_skills(user_id,skill_id,proficiency,source)
    select v_user,qs.skill_id,'learning','quest' from public.quest_skills qs where qs.quest_id=p_quest_id
    on conflict(user_id,skill_id) do update set source=case when public.user_skills.source='verified' then 'verified' else 'quest' end, updated_at=timezone('utc',now());
  insert into public.user_activities(user_id,activity_type,payload) values(v_user,'quest_completed',jsonb_build_object('quest_id',p_quest_id,'xp_awarded',v_quest.xp,'completed_at',v_progress.completed_at));
  return query select p_quest_id, v_quest.xp, v_profile.xp, v_profile.level, v_profile.level > v_old_level, v_progress.completed_at;
end $$;
