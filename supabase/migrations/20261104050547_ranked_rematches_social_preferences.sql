alter table lotus_ranked.matches add column parent_match_id uuid unique references lotus_ranked.matches;
alter table lotus_ranked.matches add column series_index integer not null default 1 check(series_index>0);
alter table lotus_ranked.matches add column opening_seat integer check(opening_seat in (0,1));

create table lotus_ranked.preferences (
 user_id uuid primary key references auth.users on delete cascade,
 allow_rematches boolean not null default true
);
create table lotus_ranked.rematches (
 match_id uuid primary key references lotus_ranked.matches,
 status text not null check(status in ('scheduled','available','offered','accepted','declined','expired')),
 from_seat integer check(from_seat in (0,1)), offer_at timestamptz,
 response_at timestamptz, expires_at timestamptz, plan jsonb not null,
 next_match_id uuid references lotus_ranked.matches
);
alter table lotus_ranked.preferences enable row level security;
alter table lotus_ranked.rematches enable row level security;
revoke all on lotus_ranked.preferences,lotus_ranked.rematches from public,anon,authenticated;
grant all on lotus_ranked.preferences,lotus_ranked.rematches to service_role;

create function public.ranked_preferences(p_user uuid,p_allow boolean) returns void
language plpgsql security invoker set search_path='' as $$
begin
 insert into lotus_ranked.preferences(user_id,allow_rematches) values(p_user,p_allow)
 on conflict(user_id) do update set allow_rematches=excluded.allow_rematches;
 if not p_allow then
  update lotus_ranked.rematches r set status='declined' from lotus_ranked.participants p
   where p.match_id=r.match_id and p.user_id=p_user and r.status='offered' and r.from_seat<>p.seat;
 end if;
end
$$;

create function public.ranked_prepare_rematch(p_match uuid,p_plan jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if not exists(select 1 from lotus_ranked.matches where id=p_match and status='finished') then return; end if;
 insert into lotus_ranked.rematches(match_id,status,plan,offer_at)
 values(p_match,case when coalesce((p_plan->>'offer')::boolean,false) then 'scheduled' else 'available' end,p_plan,
  now()+make_interval(secs=>greatest(3000,least(6000,(p_plan->>'offerDelayMs')::int))/1000.0))
 on conflict do nothing;
end $$;

-- Called under the queue advisory lock. Both competitors must still be free;
-- accepting an old offer cannot steal someone out of a new match or queue.
create function lotus_ranked.accept_rematch(p_match uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare original lotus_ranked.matches; next_id uuid; p lotus_ranked.participants;
begin
 select * into original from lotus_ranked.matches where id=p_match for update;
 select next_match_id into next_id from lotus_ranked.rematches where match_id=p_match;
 if next_id is not null then return next_id; end if;
 if not (select enabled from lotus_ranked.settings) or original.season<>(select season from lotus_ranked.settings) then
  update lotus_ranked.rematches set status='declined' where match_id=p_match;return null;
 end if;
 if exists(select 1 from lotus_ranked.participants h join lotus_ranked.active_users a on a.user_id=h.user_id where h.match_id=p_match)
  or exists(select 1 from lotus_ranked.participants h join lotus_ranked.tickets t on t.user_id=h.user_id
    where h.match_id=p_match and t.status='waiting' and t.expires_at>now()) then
  update lotus_ranked.rematches set status='declined' where match_id=p_match;return null;
 end if;
 insert into lotus_ranked.matches(season,region,parent_match_id,series_index,opening_seat)
 values(original.season,original.region,p_match,original.series_index+1,
  1-coalesce((original.data->'ranked'->>'openingSeat')::int,0)) returning id into next_id;
 for p in select * from lotus_ranked.participants where match_id=p_match order by seat loop
  insert into lotus_ranked.participants(match_id,seat,kind,user_id,name,rating_before,bot_profile_id,bot_config,bot_identity_id)
  values(next_id,p.seat,p.kind,p.user_id,p.name,case when p.kind='human' then
   (select rating from lotus_ranked.ratings where user_id=p.user_id and season=original.season) else p.rating_before end,
   p.bot_profile_id,p.bot_config,p.bot_identity_id);
  if p.kind='human' then insert into lotus_ranked.active_users values(p.user_id,next_id);end if;
 end loop;
 insert into lotus_ranked.jobs(match_id,job_key,kind,due_at,expected_version)
 values(next_id,next_id::text||':bootstrap','bootstrap',now(),0);
 update lotus_ranked.rematches set status='accepted',next_match_id=next_id where match_id=p_match;
 return next_id;
end $$;

create function public.ranked_rematch(p_user uuid,p_match uuid,p_command text default 'status') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r lotus_ranked.rematches; v_seat integer; bot integer; other_user uuid;
begin
 perform pg_advisory_xact_lock(72741,1);
 if p_command not in ('status','request','accept','decline','cancel') then raise exception 'Unknown rematch command';end if;
 select p.seat into v_seat from lotus_ranked.participants p join lotus_ranked.matches m on m.id=p.match_id
  where p.match_id=p_match and p.user_id=p_user and p.kind='human' and m.status='finished';
 if not found then raise exception 'Finished match not found';end if;
 select * into r from lotus_ranked.rematches where match_id=p_match for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 select p.seat into bot from lotus_ranked.participants p where p.match_id=p_match and p.kind='bot';
 select user_id into other_user from lotus_ranked.participants p where p.match_id=p_match and p.seat<>v_seat;
 if r.status='scheduled' and r.offer_at<=now() then
  if coalesce((select allow_rematches from lotus_ranked.preferences where user_id=p_user),true) then
   r.status:='offered';r.from_seat:=bot;r.expires_at:=r.offer_at+interval '15 seconds';
  else r.status:='available';end if;
 end if;
 if r.status='offered' and r.expires_at<=now() then r.status:='expired';end if;
 if p_command in ('decline','cancel') and r.status in ('offered','scheduled','available') then
  r.status:='declined';
 elsif (p_command='accept' and r.status<>'accepted') or (p_command='request' and r.status='offered' and r.from_seat<>v_seat) then
  if r.status<>'offered' or r.from_seat=v_seat then raise exception 'No incoming rematch offer';end if;
  update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,expires_at=r.expires_at where match_id=p_match;
  perform lotus_ranked.accept_rematch(p_match);
  select * into r from lotus_ranked.rematches where match_id=p_match;
 elsif p_command='request' and r.status in ('available','scheduled') then
  if other_user is not null and not coalesce((select allow_rematches from lotus_ranked.preferences where user_id=other_user),true) then
   r.status:='declined';
  else
   r.status:='offered';r.from_seat:=v_seat;r.expires_at:=now()+interval '15 seconds';
   if bot is not null then r.response_at:=now()+make_interval(secs=>greatest(2000,least(5000,(r.plan->>'replyDelayMs')::int))/1000.0);end if;
  end if;
 end if;
 if r.status='offered' and r.from_seat<>bot and bot is not null and r.response_at<=now() then
  if coalesce((r.plan->>'accept')::boolean,false) then
   update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,expires_at=r.expires_at where match_id=p_match;
   perform lotus_ranked.accept_rematch(p_match);select * into r from lotus_ranked.rematches where match_id=p_match;
  else r.status:='declined';end if;
 end if;
 update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,response_at=r.response_at,expires_at=r.expires_at where match_id=p_match;
 return jsonb_build_object('status',r.status,'fromSeat',case when r.from_seat is null then null else (r.from_seat-v_seat+2)%2 end,
  'expiresAt',extract(epoch from r.expires_at)*1000,'nextMatchId',r.next_match_id);
end $$;

revoke all on function lotus_ranked.accept_rematch(uuid) from public,anon,authenticated;
grant execute on function lotus_ranked.accept_rematch(uuid) to service_role;
revoke all on function public.ranked_preferences(uuid,boolean),public.ranked_prepare_rematch(uuid,jsonb),public.ranked_rematch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ranked_preferences(uuid,boolean),public.ranked_prepare_rematch(uuid,jsonb),public.ranked_rematch(uuid,uuid,text) to service_role;
