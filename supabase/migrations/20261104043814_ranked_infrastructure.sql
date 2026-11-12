-- Additive foundations only: the live private-table schema is unchanged.
create schema if not exists lotus_ranked;
revoke all on schema lotus_ranked from public, anon, authenticated;
grant usage on schema lotus_ranked to service_role;

create table lotus_ranked.settings (
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false,
 season text not null default 'launch-v1',
 disclosure_version text not null default 'ranked-ai-v1',
 disclosure_text text not null,
 fallback_ms integer not null default 12000 check(fallback_ms between 10000 and 120000),
 lease_seconds integer not null default 30 check(lease_seconds between 15 and 120),
 regions text[] not null default array['ap-south-1']::text[]
);
insert into lotus_ranked.settings(disclosure_text) values
 ('Ranked matchmaking prioritizes players and may use AI-controlled opponents when needed. Both count toward your rank.');

create table lotus_ranked.tiers (
 id text primary key, label text not null,
 floor integer not null unique check(floor between 0 and 4000),
 bot_rating integer not null check(bot_rating between 0 and 4000)
);
create table lotus_ranked.bot_profiles (
 id text primary key, tier_id text not null references lotus_ranked.tiers,
 version integer not null check(version > 0),
 rating integer not null check(rating between 0 and 4000),
 config jsonb not null, enabled boolean not null default true
);
create table lotus_ranked.disclosures (
 user_id uuid primary key references auth.users on delete cascade,
 version text not null, acknowledged_at timestamptz not null default now()
);
create table lotus_ranked.ratings (
 user_id uuid not null references auth.users on delete cascade,
 season text not null, rating integer not null default 600 check(rating between 0 and 4000),
 played integer not null default 0 check(played >= 0),
 human_played integer not null default 0 check(human_played between 0 and played),
 wins integer not null default 0 check(wins between 0 and played),
 primary key(user_id, season)
);
create table lotus_ranked.matches (
 id uuid primary key default gen_random_uuid(), season text not null, region text not null,
 status text not null default 'allocated' check(status in ('allocated','playing','finished','cancelled')),
 version integer not null default 0, data jsonb,
 created_at timestamptz not null default now(), finished_at timestamptz
);
create table lotus_ranked.participants (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references lotus_ranked.matches,
 seat integer not null check(seat in (0,1)), kind text not null check(kind in ('human','bot')),
 user_id uuid references auth.users, name text not null default 'Challenger',
 rating_before integer not null check(rating_before between 0 and 4000),
 bot_profile_id text references lotus_ranked.bot_profiles, bot_config jsonb,
 unique(match_id, seat), unique(match_id,user_id),
 check((kind='human' and user_id is not null and bot_profile_id is null and bot_config is null)
    or (kind='bot' and user_id is null and bot_profile_id is not null and bot_config is not null))
);
create index ranked_participants_user on lotus_ranked.participants(user_id,match_id) where user_id is not null;
create table lotus_ranked.active_users (
 user_id uuid primary key references auth.users,
 match_id uuid not null references lotus_ranked.matches
);
create index ranked_active_match on lotus_ranked.active_users(match_id);
create table lotus_ranked.tickets (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references auth.users on delete cascade,
 season text not null, region text not null, rating integer not null check(rating between 0 and 4000),
 joined_at timestamptz not null default now(), expires_at timestamptz not null,
 status text not null default 'waiting' check(status in ('waiting','matched','cancelled','expired')),
 match_id uuid references lotus_ranked.matches
);
create index ranked_waiting on lotus_ranked.tickets(region,joined_at,id) where status='waiting';
create table lotus_ranked.jobs (
 id uuid primary key default gen_random_uuid(), match_id uuid not null references lotus_ranked.matches,
 job_key text not null unique, kind text not null check(kind in ('bootstrap','advance')),
 due_at timestamptz not null, status text not null default 'pending' check(status in ('pending','claimed','done','failed')),
 claim_token uuid, lease_until timestamptz, attempts integer not null default 0,
 expected_version integer not null, payload jsonb not null default '{}'::jsonb,
 last_error text
);
create index ranked_due on lotus_ranked.jobs(due_at,id) where status in ('pending','claimed');
create index ranked_jobs_match on lotus_ranked.jobs(match_id);
create table lotus_ranked.results (
 match_id uuid primary key references lotus_ranked.matches,
 winner_seat integer check(winner_seat in (0,1)),
 summary jsonb not null, created_at timestamptz not null default now()
);
create table lotus_ranked.rating_events (
 match_id uuid not null references lotus_ranked.results, user_id uuid not null references auth.users,
 before_rating integer not null, after_rating integer not null,
 opponent_kind text not null, score numeric not null,
 primary key(match_id,user_id)
);

-- All state is private. Only authenticated Edge/worker code uses these RPCs.
do $$ declare t text; begin
 foreach t in array array['settings','tiers','bot_profiles','disclosures','ratings','matches','participants','active_users','tickets','jobs','results','rating_events'] loop
  execute format('alter table lotus_ranked.%I enable row level security',t);
  execute format('revoke all on lotus_ranked.%I from public, anon, authenticated',t);
  execute format('grant all on lotus_ranked.%I to service_role',t);
 end loop;
end $$;

create function public.ranked_status(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; r lotus_ranked.ratings; ticket jsonb;
begin
 select * into cfg from lotus_ranked.settings;
 select * into r from lotus_ranked.ratings where user_id=p_user and season=cfg.season;
 select to_jsonb(t) into ticket from lotus_ranked.tickets t where user_id=p_user;
 return jsonb_build_object('enabled',cfg.enabled,'season',cfg.season,'disclosureVersion',cfg.disclosure_version,
  'disclosureText',cfg.disclosure_text,'needsDisclosure',not exists(select 1 from lotus_ranked.disclosures where user_id=p_user and version=cfg.disclosure_version),
  'rating',coalesce(r.rating,600),'played',coalesce(r.played,0),'humanPlayed',coalesce(r.human_played,0),
  'tier',(select to_jsonb(t) from lotus_ranked.tiers t where floor<=coalesce(r.rating,600) order by floor desc limit 1),
  'ticket',ticket,'activeMatchId',(select match_id from lotus_ranked.active_users where user_id=p_user));
end $$;

create function public.ranked_acknowledge(p_user uuid,p_version text) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if p_version is distinct from (select disclosure_version from lotus_ranked.settings) then raise exception 'Disclosure changed. Please read the current notice.'; end if;
 insert into lotus_ranked.disclosures(user_id,version) values(p_user,p_version)
 on conflict(user_id) do update set version=excluded.version,acknowledged_at=now();
end $$;

-- A short global queue lock deliberately serializes admission, cancel and pairing
-- at launch scale. Unlike SKIP LOCKED pairing, a locked human cannot be skipped in
-- favour of a bot. Job consumption below scales independently with SKIP LOCKED.
create function public.ranked_enqueue(p_user uuid,p_region text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; skill integer;
begin
 perform pg_advisory_xact_lock(72741,1);
 select * into cfg from lotus_ranked.settings;
 if not cfg.enabled then raise exception 'Ranked is not open yet.'; end if;
 if p_region is null or not (p_region=any(cfg.regions)) then raise exception 'Unsupported region'; end if;
 if not exists(select 1 from lotus_ranked.disclosures where user_id=p_user and version=cfg.disclosure_version) then raise exception 'Read and acknowledge ranked matchmaking first.'; end if;
 if exists(select 1 from lotus_ranked.active_users where user_id=p_user) then return public.ranked_status(p_user); end if;
 insert into lotus_ranked.ratings(user_id,season) values(p_user,cfg.season) on conflict do nothing;
 select rating into skill from lotus_ranked.ratings where user_id=p_user and season=cfg.season;
 insert into lotus_ranked.tickets(user_id,season,region,rating,expires_at)
 values(p_user,cfg.season,p_region,skill,now()+make_interval(secs=>cfg.lease_seconds))
 on conflict(user_id) do update set
  id=case when lotus_ranked.tickets.status='waiting' and lotus_ranked.tickets.expires_at>now() then lotus_ranked.tickets.id else excluded.id end,
  joined_at=case when lotus_ranked.tickets.status='waiting' and lotus_ranked.tickets.expires_at>now() then lotus_ranked.tickets.joined_at else now() end,
  region=case when lotus_ranked.tickets.status='waiting' and lotus_ranked.tickets.expires_at>now() then lotus_ranked.tickets.region else excluded.region end,
  season=excluded.season,rating=excluded.rating,expires_at=excluded.expires_at,status='waiting',match_id=null;
 return public.ranked_status(p_user);
end $$;

create function public.ranked_cancel_queue(p_user uuid) returns jsonb
language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(72741,1);
 update lotus_ranked.tickets set status='cancelled' where user_id=p_user and status='waiting';
 return public.ranked_status(p_user);
end $$;

create function lotus_ranked.window_ms(p_joined timestamptz) returns integer
language sql stable security invoker set search_path='' as $$
 select case when now()-p_joined>=interval '10 seconds' then 350 when now()-p_joined>=interval '5 seconds' then 250 else 150 end
$$;

create function public.ranked_pair(p_region text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; a lotus_ranked.tickets; b lotus_ranked.tickets;
 bot lotus_ranked.bot_profiles; previous_bot text; selected_tier text; match uuid; seed bigint;
begin
 perform pg_advisory_xact_lock(72741,1);
 select * into cfg from lotus_ranked.settings;
 if not cfg.enabled then return null; end if;
 if p_region is null or not(p_region=any(cfg.regions)) then raise exception 'Unsupported region'; end if;
 update lotus_ranked.tickets set status='expired' where status='waiting' and (expires_at<=now() or season<>cfg.season);
 -- Inspect every waiting ticket: an isolated oldest player must not block a
 -- compatible pair farther down the queue.
 for a in select * from lotus_ranked.tickets where region=p_region and status='waiting' order by joined_at,id loop
  select * into b from lotus_ranked.tickets t where t.region=p_region and t.status='waiting' and t.user_id<>a.user_id
   and abs(t.rating-a.rating)<=least(lotus_ranked.window_ms(a.joined_at),lotus_ranked.window_ms(t.joined_at))
   order by t.joined_at,t.id limit 1;
  if found then exit; end if;
 end loop;
 if b.id is null then
  select * into a from lotus_ranked.tickets where region=p_region and status='waiting'
   and now()-joined_at>=make_interval(secs=>cfg.fallback_ms/1000.0) order by joined_at,id limit 1;
  if not found then return null; end if;
  select id into selected_tier from lotus_ranked.tiers where floor<=a.rating order by floor desc limit 1;
  select p.bot_profile_id into previous_bot from lotus_ranked.participants p join lotus_ranked.matches m on m.id=p.match_id
   where p.kind='bot' and exists(select 1 from lotus_ranked.participants h where h.match_id=m.id and h.user_id=a.user_id)
   order by m.created_at desc,m.id limit 1;
  select * into bot from lotus_ranked.bot_profiles where enabled
   and tier_id=selected_tier and id is distinct from previous_bot order by random() limit 1;
  if not found then return null; end if;
 end if;
 insert into lotus_ranked.matches(season,region) values(cfg.season,p_region) returning id into match;
 insert into lotus_ranked.participants(match_id,seat,kind,user_id,rating_before,name)
  values(match,0,'human',a.user_id,a.rating,coalesce((select display_name from public.profiles where id=a.user_id),'Guest'));
 if b.id is not null then
  insert into lotus_ranked.participants(match_id,seat,kind,user_id,rating_before,name)
   values(match,1,'human',b.user_id,b.rating,coalesce((select display_name from public.profiles where id=b.user_id),'Guest'));
 else
  seed:=floor(random()*4294967296)::bigint;
  insert into lotus_ranked.participants(match_id,seat,kind,rating_before,bot_profile_id,bot_config)
   values(match,1,'bot',bot.rating,bot.id,bot.config||jsonb_build_object('seed',seed));
 end if;
 insert into lotus_ranked.active_users(user_id,match_id)
  select user_id,match from lotus_ranked.participants where match_id=match and kind='human';
 update lotus_ranked.tickets set status='matched',match_id=match where id=a.id or id=b.id;
 insert into lotus_ranked.jobs(match_id,job_key,kind,due_at,expected_version)
  values(match,match::text||':bootstrap','bootstrap',now(),0);
 return match;
end $$;

create function public.ranked_claim_job() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job lotus_ranked.jobs;
begin
 select * into job from lotus_ranked.jobs where due_at<=now()
  and (status='pending' or (status='claimed' and lease_until<=now()))
  order by due_at,id limit 1 for update skip locked;
 if not found then return null; end if;
 update lotus_ranked.jobs set status='claimed',claim_token=gen_random_uuid(),lease_until=now()+interval '30 seconds',attempts=attempts+1
  where id=job.id returning * into job;
 return to_jsonb(job);
end $$;

create function public.ranked_release_job(p_job uuid,p_token uuid,p_error text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare failed_match uuid; released boolean;
begin
 update lotus_ranked.jobs set status=case when attempts>=5 then 'failed' else 'pending' end,
  due_at=now()+interval '5 seconds',claim_token=null,lease_until=null,last_error=left(p_error,200)
  where id=p_job and status='claimed' and claim_token=p_token and lease_until>now()
  returning case when attempts>=5 then match_id else null end into failed_match;
 released:=found;
 -- Failure cleanup is atomic: a crash cannot leave an active player stranded
 -- between marking a job failed and releasing the match.
 if failed_match is not null then perform public.ranked_abort(failed_match); end if;
 return released;
end $$;

-- Source of the result is the trusted, terminal engine state, never a client score.
create function lotus_ranked.settle(p_match uuid) returns void
language plpgsql security invoker set search_path='' as $$
declare m lotus_ranked.matches; a lotus_ranked.participants; b lotus_ranked.participants;
 winners jsonb; winner integer; score numeric; current_rating integer; delta integer;
begin
 select * into m from lotus_ranked.matches where id=p_match for update;
 if m.status<>'finished' or m.data->'state'->>'phase' is distinct from 'finished' then raise exception 'Match is not finished'; end if;
 winners:=m.data->'state'->'winners';
 if jsonb_typeof(winners) is distinct from 'array' or not(winners='[0]'::jsonb or winners='[1]'::jsonb or winners='[0,1]'::jsonb or winners='[1,0]'::jsonb) then raise exception 'Invalid winners'; end if;
 winner:=case when jsonb_array_length(winners)=1 then (winners->>0)::int else null end;
 insert into lotus_ranked.results(match_id,winner_seat,summary) values(p_match,winner,jsonb_build_object('winners',winners,'totals',m.data->'state'->'totals')) on conflict do nothing;
 if not found then return; end if;
 for a in select * from lotus_ranked.participants where match_id=p_match and kind='human' order by user_id loop
  select * into b from lotus_ranked.participants where match_id=p_match and seat<>a.seat;
  score:=case when winner is null then 0.5 when winner=a.seat then 1 else 0 end;
  select rating into current_rating from lotus_ranked.ratings where user_id=a.user_id and season=m.season for update;
  delta:=round(32::numeric * case when b.kind='bot' then 0.5 else 1 end *
   (score-1/(1+power(10::numeric,(b.rating_before-a.rating_before)::numeric/400))))::int;
  delta:=greatest(0,least(4000,current_rating+delta))-current_rating;
  update lotus_ranked.ratings set rating=rating+delta,played=played+1,human_played=human_played+case when b.kind='human' then 1 else 0 end,
   wins=wins+case when score=1 then 1 else 0 end where user_id=a.user_id and season=m.season;
  insert into lotus_ranked.rating_events values(p_match,a.user_id,current_rating,current_rating+delta,b.kind,score);
 end loop;
 delete from lotus_ranked.active_users where match_id=p_match;
 update lotus_ranked.jobs set status='done',claim_token=null,lease_until=null where match_id=p_match and status in ('pending','claimed');
end $$;

create function public.ranked_load_match(p_match uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select to_jsonb(m)||jsonb_build_object('participants',(select jsonb_agg(to_jsonb(p) order by seat) from lotus_ranked.participants p where match_id=m.id)) from lotus_ranked.matches m where id=p_match
$$;

-- CAS commits and optional job acknowledgments are one transaction. A stale
-- worker's token cannot commit after its lease has been reclaimed.
create function public.ranked_commit(p_match uuid,p_version integer,p_data jsonb,p_due timestamptz,p_payload jsonb,
 p_job uuid default null,p_token uuid default null) returns boolean
language plpgsql security invoker set search_path='' as $$
declare phase text; j lotus_ranked.jobs;
begin
 if p_job is not null then
  select * into j from lotus_ranked.jobs where id=p_job for update;
  if not found or j.match_id<>p_match or j.expected_version<>p_version or j.status<>'claimed'
   or j.claim_token is distinct from p_token or j.lease_until<=now() then return false; end if;
 end if;
 phase:=p_data->'state'->>'phase';
 if phase is null or phase not in ('memory','ready','decision','peek','swap','swapConfirm','lastCall','finished') then raise exception 'Invalid game phase'; end if;
 if phase<>'finished' and (p_due is null or p_due<now()-interval '1 minute') then raise exception 'Next job is required'; end if;
 update lotus_ranked.matches set data=p_data,version=version+1,status=case when phase='finished' then 'finished' else 'playing' end,
  finished_at=case when phase='finished' then now() else null end
  where id=p_match and version=p_version and status in ('allocated','playing');
 if not found then return false; end if;
 update lotus_ranked.jobs set status='done',claim_token=null,lease_until=null where match_id=p_match and expected_version=p_version and status in ('pending','claimed');
 if phase='finished' then perform lotus_ranked.settle(p_match);
 else
  insert into lotus_ranked.jobs(match_id,job_key,kind,due_at,expected_version,payload)
   values(p_match,p_match::text||':'||(p_version+1)::text,'advance',p_due,p_version+1,coalesce(p_payload,'{}'::jsonb));
 end if;
 return true;
end $$;

create function public.ranked_abort(p_match uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update lotus_ranked.matches set status='cancelled',finished_at=now() where id=p_match and status in ('allocated','playing');
 if not found then return false; end if;
 delete from lotus_ranked.active_users where match_id=p_match;
 update lotus_ranked.jobs set status='done',claim_token=null,lease_until=null where match_id=p_match and status in ('pending','claimed','failed');
 return true;
end $$;

create function public.ranked_next_job(p_match uuid) returns jsonb
language sql security invoker set search_path='' as $$
 select to_jsonb(j) from lotus_ranked.jobs j where match_id=p_match and status in ('pending','claimed') order by due_at limit 1
$$;

create function public.ranked_discard_job(p_job uuid,p_token uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
 update lotus_ranked.jobs set status='done',claim_token=null,lease_until=null
 where id=p_job and status='claimed' and claim_token=p_token and lease_until>now();
 return found;
end $$;

-- Revoke default function execution, including helpers in the private schema.
revoke all on all functions in schema lotus_ranked from public,anon,authenticated;
grant execute on all functions in schema lotus_ranked to service_role;
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'ranked\_%' escape '\' loop
  execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end $$;

-- Generated roster: node scripts/ranked-seed.mjs
insert into lotus_ranked.tiers(id,label,floor,bot_rating) values
 ('bronze','Bronze',0,650),
 ('silver','Silver',900,1050),
 ('gold','Gold',1200,1350),
 ('platinum','Platinum',1500,1650),
 ('diamond','Diamond',1800,1950);
insert into lotus_ranked.bot_profiles(id,tier_id,version,rating,config) values
 ('bronze-patient-v1','bronze',1,650,'{"id":"bronze-patient-v1","aggression":0.2,"buzzOffset":-2,"replaceMargin":1.3,"delayScale":1.15,"version":1,"tierId":"bronze","rating":650,"styleId":"patient","recall":0.7,"reactionChance":0.5,"reactionMinMs":1800,"reactionMaxMs":3000}'::jsonb),
 ('bronze-opportunist-v1','bronze',1,650,'{"id":"bronze-opportunist-v1","aggression":0.8,"buzzOffset":1,"replaceMargin":0.4,"delayScale":0.9,"version":1,"tierId":"bronze","rating":650,"styleId":"opportunist","recall":0.7,"reactionChance":0.5,"reactionMinMs":1800,"reactionMaxMs":3000}'::jsonb),
 ('bronze-tracker-v1','bronze',1,650,'{"id":"bronze-tracker-v1","aggression":0.4,"buzzOffset":0,"replaceMargin":0.8,"delayScale":1,"version":1,"tierId":"bronze","rating":650,"styleId":"tracker","recall":0.7,"reactionChance":0.5,"reactionMinMs":1800,"reactionMaxMs":3000}'::jsonb),
 ('silver-patient-v1','silver',1,1050,'{"id":"silver-patient-v1","aggression":0.2,"buzzOffset":-2,"replaceMargin":1.3,"delayScale":1.15,"version":1,"tierId":"silver","rating":1050,"styleId":"patient","recall":0.8,"reactionChance":0.65,"reactionMinMs":1400,"reactionMaxMs":2500}'::jsonb),
 ('silver-opportunist-v1','silver',1,1050,'{"id":"silver-opportunist-v1","aggression":0.8,"buzzOffset":1,"replaceMargin":0.4,"delayScale":0.9,"version":1,"tierId":"silver","rating":1050,"styleId":"opportunist","recall":0.8,"reactionChance":0.65,"reactionMinMs":1400,"reactionMaxMs":2500}'::jsonb),
 ('silver-tracker-v1','silver',1,1050,'{"id":"silver-tracker-v1","aggression":0.4,"buzzOffset":0,"replaceMargin":0.8,"delayScale":1,"version":1,"tierId":"silver","rating":1050,"styleId":"tracker","recall":0.8,"reactionChance":0.65,"reactionMinMs":1400,"reactionMaxMs":2500}'::jsonb),
 ('gold-patient-v1','gold',1,1350,'{"id":"gold-patient-v1","aggression":0.2,"buzzOffset":-2,"replaceMargin":1.3,"delayScale":1.15,"version":1,"tierId":"gold","rating":1350,"styleId":"patient","recall":0.9,"reactionChance":0.8,"reactionMinMs":1100,"reactionMaxMs":2000}'::jsonb),
 ('gold-opportunist-v1','gold',1,1350,'{"id":"gold-opportunist-v1","aggression":0.8,"buzzOffset":1,"replaceMargin":0.4,"delayScale":0.9,"version":1,"tierId":"gold","rating":1350,"styleId":"opportunist","recall":0.9,"reactionChance":0.8,"reactionMinMs":1100,"reactionMaxMs":2000}'::jsonb),
 ('gold-tracker-v1','gold',1,1350,'{"id":"gold-tracker-v1","aggression":0.4,"buzzOffset":0,"replaceMargin":0.8,"delayScale":1,"version":1,"tierId":"gold","rating":1350,"styleId":"tracker","recall":0.9,"reactionChance":0.8,"reactionMinMs":1100,"reactionMaxMs":2000}'::jsonb),
 ('platinum-patient-v1','platinum',1,1650,'{"id":"platinum-patient-v1","aggression":0.2,"buzzOffset":-2,"replaceMargin":1.3,"delayScale":1.15,"version":1,"tierId":"platinum","rating":1650,"styleId":"patient","recall":0.96,"reactionChance":0.9,"reactionMinMs":900,"reactionMaxMs":1600}'::jsonb),
 ('platinum-opportunist-v1','platinum',1,1650,'{"id":"platinum-opportunist-v1","aggression":0.8,"buzzOffset":1,"replaceMargin":0.4,"delayScale":0.9,"version":1,"tierId":"platinum","rating":1650,"styleId":"opportunist","recall":0.96,"reactionChance":0.9,"reactionMinMs":900,"reactionMaxMs":1600}'::jsonb),
 ('platinum-tracker-v1','platinum',1,1650,'{"id":"platinum-tracker-v1","aggression":0.4,"buzzOffset":0,"replaceMargin":0.8,"delayScale":1,"version":1,"tierId":"platinum","rating":1650,"styleId":"tracker","recall":0.96,"reactionChance":0.9,"reactionMinMs":900,"reactionMaxMs":1600}'::jsonb),
 ('diamond-patient-v1','diamond',1,1950,'{"id":"diamond-patient-v1","aggression":0.2,"buzzOffset":-2,"replaceMargin":1.3,"delayScale":1.15,"version":1,"tierId":"diamond","rating":1950,"styleId":"patient","recall":0.99,"reactionChance":0.97,"reactionMinMs":750,"reactionMaxMs":1300}'::jsonb),
 ('diamond-opportunist-v1','diamond',1,1950,'{"id":"diamond-opportunist-v1","aggression":0.8,"buzzOffset":1,"replaceMargin":0.4,"delayScale":0.9,"version":1,"tierId":"diamond","rating":1950,"styleId":"opportunist","recall":0.99,"reactionChance":0.97,"reactionMinMs":750,"reactionMaxMs":1300}'::jsonb),
 ('diamond-tracker-v1','diamond',1,1950,'{"id":"diamond-tracker-v1","aggression":0.4,"buzzOffset":0,"replaceMargin":0.8,"delayScale":1,"version":1,"tierId":"diamond","rating":1950,"styleId":"tracker","recall":0.99,"reactionChance":0.97,"reactionMinMs":750,"reactionMaxMs":1300}'::jsonb);
