// Build a replacement settlement from its original definition, preserving all
// trusted-engine validation, locking, idempotency and job cleanup.
import {readFileSync,writeFileSync} from 'node:fs';
const target=process.argv[2];
if(!target)throw Error('Pass the CLI-created migration path');
const original=readFileSync('supabase/migrations/20261104043814_ranked_infrastructure.sql','utf8');
let settle=original.slice(original.indexOf('create function lotus_ranked.settle('),original.indexOf('create function public.ranked_load_match('));
const previous=`delta:=round(32::numeric * case when b.kind='bot' then 0.5 else 1 end *
   (score-1/(1+power(10::numeric,(b.rating_before-a.rating_before)::numeric/400))))::int;`;
settle=settle.replaceAll('\r\n','\n');
if(!settle.includes(previous))throw Error('Settlement formula changed; review before generating');
settle=settle.replace('create function','create or replace function').replace(previous,
 'delta:=lotus_ranked.progression_delta(a.rating_before,b.rating_before,score);');
const scoring=`-- Forward-only progression v2. Past results are never rewritten.
create function lotus_ranked.progression_delta(p_rating integer,p_opponent integer,p_score numeric) returns integer
language plpgsql immutable security invoker set search_path='' as $$
declare expected numeric; amount numeric; win_min integer; loss_min integer; loss_range integer;
begin
 if p_rating is null or p_opponent is null or p_score is null or p_rating not between 0 and 4000 or p_opponent not between 0 and 4000 or p_score not in (0,0.5,1) then raise exception 'Invalid rating result'; end if;
 expected:=1/(1+power(10::numeric,(p_opponent-p_rating)::numeric/400));
 if p_rating>=1800 then amount:=32*(p_score-expected);
 else
  win_min:=case when p_rating<900 then 30 when p_rating<1200 then 26 when p_rating<1500 then 22 else 18 end;
  loss_min:=case when p_rating<900 then 6 when p_rating<1200 then 8 when p_rating<1500 then 10 else 12 end;
  loss_range:=loss_min;
  amount:=case when p_score=1 then win_min+10*(1-expected) when p_score=0 then -(loss_min+loss_range*expected) else 0 end;
 end if;
 return greatest(0,least(4000,p_rating+round(amount)::int))-p_rating;
end $$;
revoke all on function lotus_ranked.progression_delta(integer,integer,numeric) from public,anon,authenticated;
grant execute on function lotus_ranked.progression_delta(integer,integer,numeric) to service_role;

`;
const motion=`-- Scheduled form is a rating adjustment, NOT a match/result/win.
-- No backfill or invented match rows. A missed interval makes one bounded step.
create table lotus_ranked.rival_motion (
 season text not null, identity_id text not null references lotus_ranked.bot_identities,
 adjustment integer not null default 0 check(adjustment between -120 and 120),
 adjusted_at timestamptz not null default now(), primary key(season,identity_id)
);
alter table lotus_ranked.rival_motion enable row level security;
revoke all on lotus_ranked.rival_motion from public,anon,authenticated;
grant all on lotus_ranked.rival_motion to service_role;

create function lotus_ranked.refresh_rival_motion() returns integer
language plpgsql volatile security invoker set search_path='' as $$
declare current_season text; human_games integer; step integer; affected integer;
begin
 if not pg_try_advisory_xact_lock(71843092) then return 0; end if;
 select season into current_season from lotus_ranked.settings where enabled;
 if current_season is null then return 0; end if;
 insert into lotus_ranked.rival_motion(season,identity_id)
  select current_season,i.id from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id
  where i.enabled and p.enabled on conflict do nothing;
 select count(*) into human_games from lotus_ranked.results r join lotus_ranked.matches m on m.id=r.match_id
  where m.season=current_season and r.created_at>=now()-interval '24 hours';
 -- Taper background movement as actual match traffic grows.
 if human_games>=1000 then return 0; end if;
 step:=case when human_games>=100 then 6 else 12 end;
 with goals as (
  select s.identity_id, ((('x'||substr(md5(current_season||':'||s.identity_id||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD')),1,8))::bit(32)::bigint %241)-120)::int as target
  from lotus_ranked.rival_motion s where s.season=current_season and s.adjusted_at<=now()-interval '6 hours'
   and not exists(select 1 from lotus_ranked.participants b join lotus_ranked.matches m on m.id=b.match_id
    where b.bot_identity_id=s.identity_id and m.status in ('allocated','playing'))
 ) update lotus_ranked.rival_motion s set adjustment=s.adjustment+greatest(-step,least(step,g.target-s.adjustment)),adjusted_at=now()
  from goals g where s.season=current_season and s.identity_id=g.identity_id;
 get diagnostics affected=row_count;
 return affected;
end $$;
revoke all on function lotus_ranked.refresh_rival_motion() from public,anon,authenticated;
grant execute on function lotus_ranked.refresh_rival_motion() to service_role;

create or replace function lotus_ranked.rival_rating(p_identity text,p_season text) returns integer
language sql stable security invoker set search_path='' as $$
 select greatest(0,least(4000,p.rating+((i.seed-10001)/5)::int*4-70+
  coalesce((select adjustment from lotus_ranked.rival_motion where identity_id=i.id and season=p_season),0)+
  coalesce((select sum(e.before_rating-e.after_rating)::int from lotus_ranked.participants b
   join lotus_ranked.matches m on m.id=b.match_id join lotus_ranked.rating_events e on e.match_id=m.id
   where b.bot_identity_id=i.id and m.season=p_season),0)))::int
 from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id where i.id=p_identity
$$;

-- Initialize timestamps now; the first automatic movement waits six hours.
insert into lotus_ranked.rival_motion(season,identity_id)
 select s.season,i.id from lotus_ranked.settings s cross join lotus_ranked.bot_identities i;
-- pg_cron is hosted-only; local tests exercise the same guarded function.
do $$ begin
 if exists(select 1 from pg_extension where extname='pg_cron') then
  perform cron.schedule('kamayuu-rival-motion','*/10 * * * *','select lotus_ranked.refresh_rival_motion()');
 end if;
end $$;
`;
writeFileSync(target,scoring+settle+motion);
