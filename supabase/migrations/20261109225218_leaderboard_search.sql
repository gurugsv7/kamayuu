-- Literal case-insensitive search, after global ranks; no client table access.
create or replace function public.ranked_search_leaderboard(p_user uuid,p_search text,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; entries jsonb; total integer;
begin
 select * into cfg from lotus_ranked.settings;
 if not exists(select 1 from lotus_ranked.disclosures where user_id=p_user and version=cfg.disclosure_version) then raise exception 'Read and acknowledge ranked matchmaking first.'; end if;
 if p_search is null or length(p_search)>40 then raise exception 'Invalid search'; end if;
 if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'Invalid leaderboard page'; end if;
 with bot_results as (
  select p.bot_identity_id,count(*)::int as played,count(*) filter(where r.winner_seat=p.seat)::int as wins
  from lotus_ranked.participants p join lotus_ranked.results r on r.match_id=p.match_id
  join lotus_ranked.matches m on m.id=p.match_id where p.kind='bot' and m.season=cfg.season group by p.bot_identity_id
 ), rivals as (
  select i.id as entry_id,i.name,'bot'::text as kind,'competitive'::text as rating_type,
   lotus_ranked.rival_rating(i.id,cfg.season) as rating,coalesce(r.played,0) as played,coalesce(r.wins,0) as wins
  from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id
  left join bot_results r on r.bot_identity_id=i.id where i.enabled and p.enabled
 ), humans as (
  select 'player-'||md5(r.user_id::text||':'||cfg.season) as entry_id,
   coalesce(p.display_name,'Guest') as name,'human'::text as kind,'competitive'::text as rating_type,r.rating,r.played,r.wins
  from lotus_ranked.ratings r left join public.profiles p on p.id=r.user_id where r.season=cfg.season and r.played>0
 ), all_entries as (select * from rivals union all select * from humans), ranked as (
  select *,row_number() over(order by rating desc,wins desc,played asc,entry_id) as rank from all_entries
 ), filtered as (select * from ranked where strpos(lower(name),lower(btrim(p_search)))>0 or btrim(p_search)=''), page as (select * from filtered order by rank limit p_limit offset p_offset)
 select coalesce(jsonb_agg(to_jsonb(page) order by rank),'[]'::jsonb),(select count(*) from filtered) into entries,total from page;
 return jsonb_build_object('season',cfg.season,'entries',entries,'total',total,'offset',p_offset);
end $$;
revoke all on function public.ranked_search_leaderboard(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.ranked_search_leaderboard(uuid,text,integer,integer) to service_role;

