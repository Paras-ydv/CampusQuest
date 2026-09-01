begin;
select plan(7);

-- The seed accounts make ownership assertions reproducible.
set local role anon;
select is((select count(*) from public.profiles), 0::bigint, 'anon cannot read profiles');
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select is((select count(*) from public.profiles), 1::bigint, 'student sees only their own profile');
select is((select count(*) from public.user_skills), 10::bigint, 'student sees only their own skills');
select is((select count(*) from public.messages where thread_id='20000000-0000-0000-0000-000000000001'), 1::bigint, 'thread member reads messages');

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select is((select count(*) from public.messages where thread_id='20000000-0000-0000-0000-000000000001'), 0::bigint, 'non-member cannot read messages');
select throws_ok(
  $$insert into public.messages(thread_id,sender_id,body) values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','spoof')$$,
  '42501', null, 'non-member cannot spoof a message sender'
);

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select public.complete_quest('q_sysdesign');
select public.complete_quest('q_sysdesign');
select is((select xp from public.profiles where id='10000000-0000-0000-0000-000000000001'), 2430, 'duplicate completion awards XP exactly once');
select * from finish();
rollback;
