-- Lotus Buzzer is isolated from the existing cheatbetter application.
create schema if not exists lotus_private;
revoke all on schema lotus_private from public, anon, authenticated;
grant usage on schema lotus_private to service_role;

create table lotus_private.rooms (
 id uuid primary key, code text not null unique check(code ~ '^[A-Z2-9]{6}$'),
 version integer not null default 0, data jsonb not null,
 updated_at timestamptz not null default now()
);
create table lotus_private.results (
 match_id uuid primary key, room_id uuid not null, summary jsonb not null, finished_at timestamptz not null default now()
);
create table lotus_private.rate_limits (
 user_id uuid primary key, window_start timestamptz not null, requests integer not null
);
alter table lotus_private.rooms enable row level security;
alter table lotus_private.results enable row level security;
alter table lotus_private.rate_limits enable row level security;
grant all on all tables in schema lotus_private to service_role;

create table public.lotus_memberships (
 room_id uuid not null references lotus_private.rooms(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(room_id,user_id)
);
create index lotus_memberships_user on public.lotus_memberships(user_id);
alter table public.lotus_memberships enable row level security;
revoke all on public.lotus_memberships from public,anon,authenticated;
grant select on public.lotus_memberships to authenticated;
grant all on public.lotus_memberships to service_role;
create policy lotus_own_membership on public.lotus_memberships for select to authenticated using(user_id=(select auth.uid()));

create policy lotus_receive on realtime.messages for select to authenticated using (
 exists(select 1 from public.lotus_memberships m where m.user_id=(select auth.uid()) and
  ((extension='broadcast' and (select realtime.topic())='lotus:'||m.room_id::text||':player:'||m.user_id::text)
   or (extension='presence' and (select realtime.topic())='lotus:'||m.room_id::text||':presence')))
);
create policy lotus_presence on realtime.messages for insert to authenticated with check (
 extension='presence' and exists(select 1 from public.lotus_memberships m where m.user_id=(select auth.uid()) and (select realtime.topic())='lotus:'||m.room_id::text||':presence')
);

-- All RPCs below are trusted Edge-only, SECURITY INVOKER, with PUBLIC execution revoked.
create function public.lotus_gate(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare attempts integer;
begin
 insert into lotus_private.rate_limits values(p_user,now(),1)
 on conflict(user_id) do update set
 requests=case when lotus_private.rate_limits.window_start<now()-interval '1 minute' then 1 else lotus_private.rate_limits.requests+1 end,
 window_start=case when lotus_private.rate_limits.window_start<now()-interval '1 minute' then now() else lotus_private.rate_limits.window_start end
 returning requests into attempts;
 if attempts>80 then raise exception 'Too many requests. Please wait a minute.'; end if;
end $$;
create function public.lotus_load(p_id uuid default null,p_code text default null) returns jsonb language sql security invoker set search_path='' as $$
 select to_jsonb(r) from lotus_private.rooms r where (p_id is not null and r.id=p_id) or (p_id is null and r.code=p_code) limit 1
$$;
create function public.lotus_create(p_id uuid,p_code text,p_data jsonb,p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 delete from lotus_private.rooms where updated_at<now()-interval '24 hours';
 delete from lotus_private.rate_limits where window_start<now()-interval '1 day';
 if (select count(*) from public.lotus_memberships where user_id=p_user)>=3 then raise exception 'Leave an existing room before creating another.'; end if;
 insert into lotus_private.rooms(id,code,data) values(p_id,p_code,p_data);
 insert into public.lotus_memberships values(p_id,p_user);
 select to_jsonb(r) into result from lotus_private.rooms r where id=p_id;
 return result;
end $$;
create function public.lotus_commit(p_id uuid,p_version integer,p_data jsonb,p_packets jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare packet jsonb; member jsonb;
begin
 update lotus_private.rooms set data=p_data,version=version+1,updated_at=now() where id=p_id and version=p_version;
 if not found then return false; end if;
 delete from public.lotus_memberships where room_id=p_id and user_id not in(select (m->>'id')::uuid from jsonb_array_elements(p_data->'members') m);
 for member in select value from jsonb_array_elements(p_data->'members') loop
  insert into public.lotus_memberships values(p_id,(member->>'id')::uuid) on conflict do nothing;
 end loop;
 for packet in select value from jsonb_array_elements(p_packets) loop
  perform realtime.send(packet->'payload','sync','lotus:'||p_id::text||':player:'||(packet->>'user_id'),true);
 end loop;
 if p_data->'state'->>'phase'='finished' then
  insert into lotus_private.results(match_id,room_id,summary) values((p_data->>'matchId')::uuid,p_id,
   jsonb_build_object('members',p_data->'members','winners',p_data->'state'->'winners','totals',p_data->'state'->'totals')) on conflict do nothing;
 end if;
 return true;
end $$;
revoke all on function public.lotus_gate(uuid),public.lotus_load(uuid,text),public.lotus_create(uuid,text,jsonb,uuid),public.lotus_commit(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.lotus_gate(uuid),public.lotus_load(uuid,text),public.lotus_create(uuid,text,jsonb,uuid),public.lotus_commit(uuid,integer,jsonb,jsonb) to service_role;
