-- AI rematches always acknowledge a player click before allocating the next game.
alter table lotus_ranked.rematches add column bot_confirmation boolean not null default false;

create or replace function public.ranked_rematch(p_user uuid,p_match uuid,p_command text default 'status') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r lotus_ranked.rematches; v_seat integer; bot integer; other_user uuid;
 v_now timestamptz; reply_delay interval; reply_scheduled boolean:=false;
begin
 perform pg_advisory_xact_lock(72741,1);
 if p_command not in ('status','request','accept','decline','cancel') then raise exception 'Unknown rematch command';end if;
 select p.seat into v_seat from lotus_ranked.participants p join lotus_ranked.matches m on m.id=p.match_id
  where p.match_id=p_match and p.user_id=p_user and p.kind='human' and m.status='finished';
 if not found then raise exception 'Finished match not found';end if;
 select * into r from lotus_ranked.rematches where match_id=p_match for update;
 if not found then return jsonb_build_object('status','unavailable');end if;
 -- Start timing after acquiring locks, not at transaction start.
 v_now:=clock_timestamp();
 reply_delay:=make_interval(secs=>greatest(2000,least(5000,coalesce((r.plan->>'replyDelayMs')::int,3000)))/1000.0);
 select p.seat into bot from lotus_ranked.participants p where p.match_id=p_match and p.kind='bot';
 select user_id into other_user from lotus_ranked.participants p where p.match_id=p_match and p.seat<>v_seat;
 if r.status='scheduled' and r.offer_at<=v_now then
  if bot is not null and coalesce((select allow_rematches from lotus_ranked.preferences where user_id=p_user),true) then
   r.status:='offered';r.from_seat:=bot;r.expires_at:=r.offer_at+interval '15 seconds';
  else r.status:='available';end if;
 end if;
 if r.status='offered' and r.expires_at<=v_now then r.status:='expired';end if;
 if p_command in ('decline','cancel') and r.status in ('offered','scheduled','available') then
  r.status:='declined';
 elsif p_command='accept' and bot is not null and r.status='offered' and r.from_seat=v_seat and r.bot_confirmation then
  -- A retried acceptance must neither restart nor bypass the original deadline.
  null;
 elsif (p_command='accept' and r.status<>'accepted') or (p_command='request' and r.status='offered' and r.from_seat<>v_seat) then
  if r.status<>'offered' or r.from_seat=v_seat then raise exception 'No incoming rematch offer';end if;
  if bot is null then
   update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,expires_at=r.expires_at where match_id=p_match;
   perform lotus_ranked.accept_rematch(p_match);
   select * into r from lotus_ranked.rematches where match_id=p_match;
  else
   -- Explicit AI acceptance and crossed AI/player offers both await confirmation.
   -- The AI already offered, so preserve that willingness instead of rerolling.
   r.from_seat:=v_seat;r.bot_confirmation:=true;
   r.response_at:=clock_timestamp()+reply_delay;r.expires_at:=clock_timestamp()+interval '15 seconds';
   reply_scheduled:=true;
  end if;
 elsif p_command='request' and r.status in ('available','scheduled') then
  if other_user is not null and not coalesce((select allow_rematches from lotus_ranked.preferences where user_id=other_user),true) then
   r.status:='declined';
  else
   r.status:='offered';r.from_seat:=v_seat;r.expires_at:=clock_timestamp()+interval '15 seconds';r.bot_confirmation:=false;
   if bot is not null then r.response_at:=clock_timestamp()+reply_delay;reply_scheduled:=true;end if;
  end if;
 end if;
 -- Never resolve a reply during the same request that scheduled it.
 if not reply_scheduled and r.status='offered' and r.from_seat<>bot and bot is not null and r.response_at<=clock_timestamp() then
  if r.bot_confirmation or coalesce((r.plan->>'accept')::boolean,false) then
   update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,response_at=r.response_at,expires_at=r.expires_at,bot_confirmation=r.bot_confirmation where match_id=p_match;
   perform lotus_ranked.accept_rematch(p_match);select * into r from lotus_ranked.rematches where match_id=p_match;
  else r.status:='declined';end if;
 end if;
 update lotus_ranked.rematches set status=r.status,from_seat=r.from_seat,response_at=r.response_at,expires_at=r.expires_at,bot_confirmation=r.bot_confirmation where match_id=p_match;
 return jsonb_build_object('status',r.status,'fromSeat',case when r.from_seat is null then null else (r.from_seat-v_seat+2)%2 end,
  'expiresAt',extract(epoch from r.expires_at)*1000,'nextMatchId',r.next_match_id);
end $$;
revoke all on function public.ranked_rematch(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.ranked_rematch(uuid,uuid,text) to service_role;
