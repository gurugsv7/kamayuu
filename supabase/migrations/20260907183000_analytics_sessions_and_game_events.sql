-- Lightweight product analytics: session engagement and a gameplay event funnel,
-- entirely server-authoritative like the rest of Lotus's trusted tables. Nothing
-- here is client-readable — these rows are for developer inspection via SQL, not
-- player-facing stats (see public.profiles for those). A session's `id` is
-- client-generated once per page load; game_events.session_id links a tracked
-- event back to the session that produced it (nullable, since some events are
-- fired purely server-side with no client session in scope).
create table lotus_private.sessions (
 id uuid primary key,
 user_id uuid not null references auth.users(id) on delete cascade,
 started_at timestamptz not null default now(),
 last_seen_at timestamptz not null default now()
);
create index sessions_user on lotus_private.sessions(user_id);
create index sessions_started on lotus_private.sessions(started_at);
alter table lotus_private.sessions enable row level security;

create table lotus_private.game_events (
 id bigint generated always as identity primary key,
 session_id uuid references lotus_private.sessions(id) on delete set null,
 user_id uuid not null references auth.users(id) on delete cascade,
 event text not null,
 room_code text,
 mode text check (mode in ('solo','online')),
 players integer,
 meta jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now()
);
create index game_events_user on lotus_private.game_events(user_id);
create index game_events_session on lotus_private.game_events(session_id);
create index game_events_event on lotus_private.game_events(event);
create index game_events_created on lotus_private.game_events(created_at);
alter table lotus_private.game_events enable row level security;

grant all on lotus_private.sessions to service_role;
grant all on lotus_private.game_events to service_role;

-- One trusted entry point for both halves: upserts the session's heartbeat when a
-- session id is given, and appends a game_events row when an event name is given.
-- Either can be used alone (a bare heartbeat ping passes no event; a server-fired
-- event with no client session in scope passes no session) or together.
create function public.lotus_track(
 p_user uuid, p_event text default null, p_session uuid default null,
 p_room text default null, p_mode text default null,
 p_players integer default null, p_meta jsonb default '{}'::jsonb
) returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_session is not null then
  insert into lotus_private.sessions(id,user_id) values(p_session,p_user)
   on conflict(id) do update set last_seen_at=now()
   where lotus_private.sessions.user_id=excluded.user_id;
 end if;
 if p_event is not null then
  insert into lotus_private.game_events(session_id,user_id,event,room_code,mode,players,meta)
  values(p_session,p_user,p_event,p_room,p_mode,p_players,p_meta);
 end if;
end $$;
revoke all on function public.lotus_track(uuid,text,uuid,text,text,integer,jsonb) from public,anon,authenticated;
grant execute on function public.lotus_track(uuid,text,uuid,text,text,integer,jsonb) to service_role;
