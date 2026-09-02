-- Connections: accepting must actually connect, and messaging must require it
-- ---------------------------------------------------------------------------
-- Two gaps this closes.
--
-- Accepting a request only set `status = 'accepted'`. Nothing ever wrote to
-- `connections`, so the connected state never materialised: the People screen
-- could not show who you were connected to, and the Team Player badge counted
-- rows that were never created. The two writes have to happen together, which
-- is why this is a function rather than two statements in the application.
--
-- `create_direct_thread` also let anyone open a thread with anyone. A direct
-- message now requires an accepted connection; the way to reach someone you are
-- not connected to is the message carried on the connection request itself.

create or replace function public.accept_connection_request(p_request_id uuid)
returns public.connection_requests
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_row public.connection_requests%rowtype;
begin
  select * into v_row from public.connection_requests where id = p_request_id;
  if not found then raise exception 'connection request not found'; end if;
  if v_row.recipient_id <> v_me then raise exception 'only the recipient can accept'; end if;

  -- Accepting twice is a no-op, not an error: the button can be double-clicked.
  if v_row.status <> 'pending' then return v_row; end if;

  update public.connection_requests
     set status = 'accepted', responded_at = timezone('utc', now())
   where id = p_request_id
  returning * into v_row;

  -- connections stores the pair ordered, so a duplicate cannot be created by
  -- accepting from either side.
  insert into public.connections(user_a_id, user_b_id)
  values (least(v_row.requester_id, v_row.recipient_id), greatest(v_row.requester_id, v_row.recipient_id))
  on conflict (user_a_id, user_b_id) do nothing;

  return v_row;
end; $$;

revoke all on function public.accept_connection_request(uuid) from public;
grant execute on function public.accept_connection_request(uuid) to authenticated;

-- Direct threads now require an accepted connection.
create or replace function public.create_direct_thread(p_other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_me uuid := auth.uid(); v_id uuid; v_key text;
begin
  if v_me is null or v_me = p_other_user_id then raise exception 'invalid direct thread members'; end if;
  if not exists(select 1 from public.profiles where id = p_other_user_id) then raise exception 'profile not found'; end if;

  if not exists(
    select 1 from public.connections
     where (user_a_id = least(v_me, p_other_user_id) and user_b_id = greatest(v_me, p_other_user_id))
  ) then
    raise exception 'not connected';
  end if;

  v_key := least(v_me::text, p_other_user_id::text) || ':' || greatest(v_me::text, p_other_user_id::text);
  insert into public.threads(kind, direct_key, created_by) values('direct', v_key, v_me)
    on conflict(direct_key) do update set updated_at = public.threads.updated_at returning id into v_id;
  insert into public.thread_members(thread_id, user_id) values(v_id, v_me), (v_id, p_other_user_id)
    on conflict do nothing;
  return v_id;
end; $$;

revoke all on function public.create_direct_thread(uuid) from public;
grant execute on function public.create_direct_thread(uuid) to authenticated;

-- Backfill: every already-accepted request should have its connection.
insert into public.connections(user_a_id, user_b_id)
select distinct least(requester_id, recipient_id), greatest(requester_id, recipient_id)
from public.connection_requests where status = 'accepted'
on conflict (user_a_id, user_b_id) do nothing;
