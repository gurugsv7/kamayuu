-- Append-only follow-up: preserve the already-reviewed initial migration.
alter table lotus_ranked.settings drop constraint settings_fallback_ms_check;
alter table lotus_ranked.settings alter column fallback_ms set default 3000;
alter table lotus_ranked.settings add constraint settings_fallback_ms_check check(fallback_ms between 500 and 30000);
alter table lotus_ranked.settings add column empty_queue_ms integer not null default 750
 check(empty_queue_ms between 250 and 30000 and empty_queue_ms<=fallback_ms);
update lotus_ranked.settings set fallback_ms=3000;
-- Initial prelaunch notice: ranked has not been deployed or opened to players.
update lotus_ranked.settings set disclosure_text='Ranked matchmaking prioritizes players and may use AI-controlled opponents when needed. Both count toward your rank. The leaderboard includes AI-controlled rivals.';

create table lotus_ranked.bot_identities (
 id text primary key, name text not null unique check(char_length(name) between 1 and 16),
 profile_id text not null references lotus_ranked.bot_profiles,
 seed bigint not null check(seed between 0 and 4294967295), enabled boolean not null default true
);
alter table lotus_ranked.bot_identities enable row level security;
revoke all on lotus_ranked.bot_identities from public,anon,authenticated;
grant all on lotus_ranked.bot_identities to service_role;
alter table lotus_ranked.participants add column bot_identity_id text references lotus_ranked.bot_identities;
alter table lotus_ranked.participants add constraint ranked_identity_bot_only check(bot_identity_id is null or kind='bot');
create index ranked_participant_identity on lotus_ranked.participants(bot_identity_id,match_id) where bot_identity_id is not null;

create or replace function lotus_ranked.window_ms(p_joined timestamptz) returns integer
language sql stable security invoker set search_path='' as $$
 select case when now()-p_joined>=interval '2 seconds' then 350 when now()-p_joined>=interval '1 second' then 250 else 150 end
$$;

create or replace function public.ranked_pair(p_region text) returns uuid
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; a lotus_ranked.tickets; b lotus_ranked.tickets;
 bot lotus_ranked.bot_profiles; identity lotus_ranked.bot_identities;
 previous_identity text; selected_tier text; match uuid;
begin
 perform pg_advisory_xact_lock(72741,1);
 select * into cfg from lotus_ranked.settings;
 if not cfg.enabled then return null; end if;
 if p_region is null or not(p_region=any(cfg.regions)) then raise exception 'Unsupported region'; end if;
 update lotus_ranked.tickets set status='expired' where status='waiting' and (expires_at<=now() or season<>cfg.season);
 -- Actual waiting humans matter; an online player already in a game is not an
 -- available opponent. Always consume compatible human pairs before any bot.
 for a in select * from lotus_ranked.tickets where region=p_region and status='waiting' order by joined_at,id loop
  select * into b from lotus_ranked.tickets t where t.region=p_region and t.status='waiting' and t.user_id<>a.user_id
   and abs(t.rating-a.rating)<=least(lotus_ranked.window_ms(a.joined_at),lotus_ranked.window_ms(t.joined_at))
   order by t.joined_at,t.id limit 1;
  if found then exit; end if;
 end loop;
 if b.id is null then
  select * into a from lotus_ranked.tickets t where t.region=p_region and t.status='waiting'
   and now()-t.joined_at>=make_interval(secs=>(case when exists(
    select 1 from lotus_ranked.tickets other where other.region=p_region and other.status='waiting' and other.user_id<>t.user_id
   ) then cfg.fallback_ms else cfg.empty_queue_ms end)/1000.0)
   order by t.joined_at,t.id limit 1;
  if not found then return null; end if;
  select id into selected_tier from lotus_ranked.tiers where floor<=a.rating order by floor desc limit 1;
  select p.bot_identity_id into previous_identity from lotus_ranked.participants p join lotus_ranked.matches m on m.id=p.match_id
   where p.kind='bot' and exists(select 1 from lotus_ranked.participants h where h.match_id=m.id and h.user_id=a.user_id)
   order by m.created_at desc,m.id limit 1;
  select i.* into identity from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id
   where i.enabled and p.enabled and p.tier_id=selected_tier
   -- Prefer an idle rival, but allow parallel challenges when every identity in
   -- the tier is busy: a finite cosmetic roster must not create minute-long waits.
   order by (i.id is not distinct from previous_identity),exists(select 1 from lotus_ranked.participants current join lotus_ranked.matches m on m.id=current.match_id
    where current.bot_identity_id=i.id and m.status in ('allocated','playing')),random() limit 1;
  if not found then return null; end if;
  select * into bot from lotus_ranked.bot_profiles where id=identity.profile_id;
 end if;
 insert into lotus_ranked.matches(season,region) values(cfg.season,p_region) returning id into match;
 insert into lotus_ranked.participants(match_id,seat,kind,user_id,rating_before,name)
  values(match,0,'human',a.user_id,a.rating,coalesce((select display_name from public.profiles where id=a.user_id),'Guest'));
 if b.id is not null then
  insert into lotus_ranked.participants(match_id,seat,kind,user_id,rating_before,name)
   values(match,1,'human',b.user_id,b.rating,coalesce((select display_name from public.profiles where id=b.user_id),'Guest'));
 else
  insert into lotus_ranked.participants(match_id,seat,kind,rating_before,bot_profile_id,bot_config,bot_identity_id,name)
   values(match,1,'bot',bot.rating,bot.id,bot.config||jsonb_build_object('seed',identity.seed),identity.id,identity.name);
 end if;
 insert into lotus_ranked.active_users(user_id,match_id)
  select user_id,match from lotus_ranked.participants where match_id=match and kind='human';
 update lotus_ranked.tickets set status='matched',match_id=match where id=a.id or id=b.id;
 insert into lotus_ranked.jobs(match_id,job_key,kind,due_at,expected_version)
  values(match,match::text||':bootstrap','bootstrap',now(),0);
 return match;
end $$;

-- A second compatible human can be paired in the admission request itself,
-- without waiting for a worker polling cycle. Re-entry is still idempotent.
alter function public.ranked_enqueue(uuid,text) rename to ranked_enqueue_ticket;
create function public.ranked_enqueue(p_user uuid,p_region text) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 result:=public.ranked_enqueue_ticket(p_user,p_region);
 if result->>'activeMatchId' is null then perform public.ranked_pair(p_region); end if;
 return public.ranked_status(p_user);
end $$;

-- Bots occupy benchmark standings on the same rating scale, not fabricated
-- human accounts. Human scores and every win/game count come from real results.
create function public.ranked_leaderboard(p_user uuid,p_limit integer default 50,p_offset integer default 0) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare cfg lotus_ranked.settings; entries jsonb; total integer;
begin
 select * into cfg from lotus_ranked.settings;
 if not exists(select 1 from lotus_ranked.disclosures where user_id=p_user and version=cfg.disclosure_version) then raise exception 'Read and acknowledge ranked matchmaking first.'; end if;
 if p_limit is null or p_limit<1 or p_limit>100 or p_offset is null or p_offset<0 or p_offset>10000 then raise exception 'Invalid leaderboard page'; end if;
 with bot_results as (
  select p.bot_identity_id,count(*)::int as played,count(*) filter(where r.winner_seat=p.seat)::int as wins
  from lotus_ranked.participants p join lotus_ranked.results r on r.match_id=p.match_id
  join lotus_ranked.matches m on m.id=p.match_id where p.kind='bot' and m.season=cfg.season group by p.bot_identity_id
 ), rivals as (
  select i.id as entry_id,i.name,'bot'::text as kind,'benchmark'::text as rating_type,
   p.rating,coalesce(r.played,0) as played,coalesce(r.wins,0) as wins
  from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id
  left join bot_results r on r.bot_identity_id=i.id where i.enabled and p.enabled
 ), humans as (
  select 'player-'||md5(r.user_id::text||':'||cfg.season) as entry_id,
   coalesce(p.display_name,'Guest') as name,'human'::text as kind,'competitive'::text as rating_type,r.rating,r.played,r.wins
  from lotus_ranked.ratings r left join public.profiles p on p.id=r.user_id where r.season=cfg.season and r.played>0
 ), all_entries as (select * from rivals union all select * from humans), ranked as (
  select *,rank() over(order by rating desc) as rank from all_entries
 ), page as (select * from ranked order by rating desc,entry_id limit p_limit offset p_offset)
 select coalesce(jsonb_agg(to_jsonb(page) order by rating desc,entry_id),'[]'::jsonb),(select count(*) from all_entries) into entries,total from page;
 return jsonb_build_object('season',cfg.season,'entries',entries,'total',total,'offset',p_offset);
end $$;

revoke all on function public.ranked_enqueue(uuid,text),public.ranked_leaderboard(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.ranked_enqueue(uuid,text),public.ranked_leaderboard(uuid,integer,integer) to service_role;

-- Generated fictional rivals: node scripts/ranked-roster-seed.mjs
insert into lotus_ranked.bot_identities(id,name,profile_id,seed) values
 ('rival-001','Aarav Shah','bronze-patient-v1',10001),
 ('rival-002','Vivaan Rao','silver-patient-v1',10002),
 ('rival-003','Aditya Nair','gold-patient-v1',10003),
 ('rival-004','Vihaan Sen','platinum-patient-v1',10004),
 ('rival-005','Arjun Iyer','diamond-patient-v1',10005),
 ('rival-006','Sai Kumar','bronze-opportunist-v1',10006),
 ('rival-007','Reyansh Das','silver-opportunist-v1',10007),
 ('rival-008','Ayaan Sethi','gold-opportunist-v1',10008),
 ('rival-009','Krishna Menon','platinum-opportunist-v1',10009),
 ('rival-010','Ishaan Patel','diamond-opportunist-v1',10010),
 ('rival-011','Shaurya Jain','bronze-tracker-v1',10011),
 ('rival-012','Atharv Joshi','silver-tracker-v1',10012),
 ('rival-013','Advik Kapoor','gold-tracker-v1',10013),
 ('rival-014','Pranav Bose','platinum-tracker-v1',10014),
 ('rival-015','Kabir Mehta','diamond-tracker-v1',10015),
 ('rival-016','Ritvik Bhat','bronze-patient-v1',10016),
 ('rival-017','Dhruv Sinha','silver-patient-v1',10017),
 ('rival-018','Aryan Pillai','gold-patient-v1',10018),
 ('rival-019','Yuvan Reddy','platinum-patient-v1',10019),
 ('rival-020','Ved Arora','diamond-patient-v1',10020),
 ('rival-021','Ananya Shah','bronze-opportunist-v1',10021),
 ('rival-022','Diya Rao','silver-opportunist-v1',10022),
 ('rival-023','Aadhya Nair','gold-opportunist-v1',10023),
 ('rival-024','Saanvi Sen','platinum-opportunist-v1',10024),
 ('rival-025','Myra Iyer','diamond-opportunist-v1',10025),
 ('rival-026','Aanya Kumar','bronze-tracker-v1',10026),
 ('rival-027','Ira Das','silver-tracker-v1',10027),
 ('rival-028','Kiara Sethi','gold-tracker-v1',10028),
 ('rival-029','Avni Menon','platinum-tracker-v1',10029),
 ('rival-030','Pari Patel','diamond-tracker-v1',10030),
 ('rival-031','Navya Jain','bronze-patient-v1',10031),
 ('rival-032','Riya Joshi','silver-patient-v1',10032),
 ('rival-033','Anika Kapoor','gold-patient-v1',10033),
 ('rival-034','Sara Bose','platinum-patient-v1',10034),
 ('rival-035','Meera Mehta','diamond-patient-v1',10035),
 ('rival-036','Tara Bhat','bronze-opportunist-v1',10036),
 ('rival-037','Ishita Sinha','silver-opportunist-v1',10037),
 ('rival-038','Nitya Pillai','gold-opportunist-v1',10038),
 ('rival-039','Kavya Reddy','platinum-opportunist-v1',10039),
 ('rival-040','Veda Arora','diamond-opportunist-v1',10040),
 ('rival-041','Karthik Ravi','bronze-tracker-v1',10041),
 ('rival-042','Surya Mani','silver-tracker-v1',10042),
 ('rival-043','Vijay Arun','gold-tracker-v1',10043),
 ('rival-044','Ashwin Bala','platinum-tracker-v1',10044),
 ('rival-045','Naveen Raj','diamond-tracker-v1',10045),
 ('rival-046','Prakash Siva','bronze-patient-v1',10046),
 ('rival-047','Harish Kannan','silver-patient-v1',10047),
 ('rival-048','Dinesh Selvan','gold-patient-v1',10048),
 ('rival-049','Ganesh Vasu','platinum-patient-v1',10049),
 ('rival-050','Vignesh Vel','diamond-patient-v1',10050),
 ('rival-051','Ajay Mohan','bronze-opportunist-v1',10051),
 ('rival-052','Sanjay Anand','silver-opportunist-v1',10052),
 ('rival-053','Deepak Hari','gold-opportunist-v1',10053),
 ('rival-054','Varun Gopal','platinum-opportunist-v1',10054),
 ('rival-055','Rohit Murali','diamond-opportunist-v1',10055),
 ('rival-056','Sathish Deva','bronze-tracker-v1',10056),
 ('rival-057','Manoj Rishi','silver-tracker-v1',10057),
 ('rival-058','Nikhil Dev','gold-tracker-v1',10058),
 ('rival-059','Akash Ram','platinum-tracker-v1',10059),
 ('rival-060','Bharath Arun','diamond-tracker-v1',10060),
 ('rival-061','Janani Ravi','bronze-patient-v1',10061),
 ('rival-062','Divya Mani','silver-patient-v1',10062),
 ('rival-063','Priya Arun','gold-patient-v1',10063),
 ('rival-064','Sneha Bala','platinum-patient-v1',10064),
 ('rival-065','Keerthi Raj','diamond-patient-v1',10065),
 ('rival-066','Pavithra Siva','bronze-opportunist-v1',10066),
 ('rival-067','Harini Kannan','silver-opportunist-v1',10067),
 ('rival-068','Nandini Vasu','gold-opportunist-v1',10068),
 ('rival-069','Shreya Vel','platinum-opportunist-v1',10069),
 ('rival-070','Swathi Mohan','diamond-opportunist-v1',10070),
 ('rival-071','Lakshmi Anand','bronze-tracker-v1',10071),
 ('rival-072','Deepa Hari','silver-tracker-v1',10072),
 ('rival-073','Gayathri Ram','gold-tracker-v1',10073),
 ('rival-074','Revathi Gopal','platinum-tracker-v1',10074),
 ('rival-075','Malini Murali','diamond-tracker-v1',10075),
 ('rival-076','Sandhya Deva','bronze-patient-v1',10076),
 ('rival-077','Anjali Rishi','silver-patient-v1',10077),
 ('rival-078','Amala Dev','gold-patient-v1',10078),
 ('rival-079','Bhavna Raj','platinum-patient-v1',10079),
 ('rival-080','Yamini Arun','diamond-patient-v1',10080),
 ('rival-081','Dev Shah','bronze-opportunist-v1',10081),
 ('rival-082','Rohan Rao','silver-opportunist-v1',10082),
 ('rival-083','Neel Nair','gold-opportunist-v1',10083),
 ('rival-084','Aman Sen','platinum-opportunist-v1',10084),
 ('rival-085','Rahul Iyer','diamond-opportunist-v1',10085),
 ('rival-086','Kunal Kumar','bronze-tracker-v1',10086),
 ('rival-087','Tanmay Das','silver-tracker-v1',10087),
 ('rival-088','Yash Sethi','gold-tracker-v1',10088),
 ('rival-089','Om Menon','platinum-tracker-v1',10089),
 ('rival-090','Samar Patel','diamond-tracker-v1',10090),
 ('rival-091','Parth Jain','bronze-patient-v1',10091),
 ('rival-092','Sahil Joshi','silver-patient-v1',10092),
 ('rival-093','Rishi Kapoor','gold-patient-v1',10093),
 ('rival-094','Mihir Bose','platinum-patient-v1',10094),
 ('rival-095','Ansh Mehta','diamond-patient-v1',10095),
 ('rival-096','Tushar Bhat','bronze-opportunist-v1',10096),
 ('rival-097','Nitin Sinha','silver-opportunist-v1',10097),
 ('rival-098','Vivek Pillai','gold-opportunist-v1',10098),
 ('rival-099','Tejas Reddy','platinum-opportunist-v1',10099),
 ('rival-100','Abhay Arora','diamond-opportunist-v1',10100),
 ('rival-101','Neha Shah','bronze-tracker-v1',10101),
 ('rival-102','Pooja Rao','silver-tracker-v1',10102),
 ('rival-103','Sana Nair','gold-tracker-v1',10103),
 ('rival-104','Aditi Sen','platinum-tracker-v1',10104),
 ('rival-105','Simran Iyer','diamond-tracker-v1',10105),
 ('rival-106','Kriti Kumar','bronze-patient-v1',10106),
 ('rival-107','Rhea Das','silver-patient-v1',10107),
 ('rival-108','Naina Sethi','gold-patient-v1',10108),
 ('rival-109','Sonal Menon','platinum-patient-v1',10109),
 ('rival-110','Mahi Patel','diamond-patient-v1',10110),
 ('rival-111','Jiya Jain','bronze-opportunist-v1',10111),
 ('rival-112','Trisha Joshi','silver-opportunist-v1',10112),
 ('rival-113','Esha Kapoor','gold-opportunist-v1',10113),
 ('rival-114','Rupali Bose','platinum-opportunist-v1',10114),
 ('rival-115','Tanvi Mehta','diamond-opportunist-v1',10115),
 ('rival-116','Palak Bhat','bronze-tracker-v1',10116),
 ('rival-117','Aisha Sinha','silver-tracker-v1',10117),
 ('rival-118','Sakshi Pillai','gold-tracker-v1',10118),
 ('rival-119','Isha Reddy','platinum-tracker-v1',10119),
 ('rival-120','Zoya Arora','diamond-tracker-v1',10120),
 ('rival-121','Arnav Dutta','bronze-patient-v1',10121),
 ('rival-122','Soham Roy','silver-patient-v1',10122),
 ('rival-123','Ishan Pal','gold-patient-v1',10123),
 ('rival-124','Rudra Ghosh','platinum-patient-v1',10124),
 ('rival-125','Niloy Saha','diamond-patient-v1',10125),
 ('rival-126','Deb Sen','bronze-opportunist-v1',10126),
 ('rival-127','Anirban Das','silver-opportunist-v1',10127),
 ('rival-128','Joy Banerjee','gold-opportunist-v1',10128),
 ('rival-129','Arka Ghosh','platinum-opportunist-v1',10129),
 ('rival-130','Ritam Dey','diamond-opportunist-v1',10130),
 ('rival-131','Anushka Dutta','bronze-tracker-v1',10131),
 ('rival-132','Sohini Roy','silver-tracker-v1',10132),
 ('rival-133','Oindrila Pal','gold-tracker-v1',10133),
 ('rival-134','Roshni Ghosh','platinum-tracker-v1',10134),
 ('rival-135','Moumita Saha','diamond-tracker-v1',10135),
 ('rival-136','Ritu Sen','bronze-patient-v1',10136),
 ('rival-137','Mitali Das','silver-patient-v1',10137),
 ('rival-138','Piya Banerjee','gold-patient-v1',10138),
 ('rival-139','Keya Ghosh','platinum-patient-v1',10139),
 ('rival-140','Rini Dey','diamond-patient-v1',10140),
 ('rival-141','Minh Tran','bronze-opportunist-v1',10141),
 ('rival-142','Linh Nguyen','silver-opportunist-v1',10142),
 ('rival-143','Bao Le','gold-opportunist-v1',10143),
 ('rival-144','Mai Pham','platinum-opportunist-v1',10144),
 ('rival-145','An Vo','diamond-opportunist-v1',10145),
 ('rival-146','Huy Dang','bronze-tracker-v1',10146),
 ('rival-147','Thao Bui','silver-tracker-v1',10147),
 ('rival-148','Nam Ho','gold-tracker-v1',10148),
 ('rival-149','Nhi Do','platinum-tracker-v1',10149),
 ('rival-150','Duy Vu','diamond-tracker-v1',10150),
 ('rival-151','Wei Lin','bronze-patient-v1',10151),
 ('rival-152','Mei Chen','silver-patient-v1',10152),
 ('rival-153','Jun Wang','gold-patient-v1',10153),
 ('rival-154','Jia Liu','platinum-patient-v1',10154),
 ('rival-155','Hao Zhang','diamond-patient-v1',10155),
 ('rival-156','Xin Wu','bronze-opportunist-v1',10156),
 ('rival-157','Yan Zhou','silver-opportunist-v1',10157),
 ('rival-158','Tao Xu','gold-opportunist-v1',10158),
 ('rival-159','Ning Zhao','platinum-opportunist-v1',10159),
 ('rival-160','Lei Sun','diamond-opportunist-v1',10160),
 ('rival-161','Haru Mori','bronze-tracker-v1',10161),
 ('rival-162','Yui Sato','silver-tracker-v1',10162),
 ('rival-163','Ren Ito','gold-tracker-v1',10163),
 ('rival-164','Aoi Kato','platinum-tracker-v1',10164),
 ('rival-165','Sora Abe','diamond-tracker-v1',10165),
 ('rival-166','Mina Kim','bronze-patient-v1',10166),
 ('rival-167','Joon Park','silver-patient-v1',10167),
 ('rival-168','Yuna Lee','gold-patient-v1',10168),
 ('rival-169','Jiho Han','platinum-patient-v1',10169),
 ('rival-170','Ara Choi','diamond-patient-v1',10170),
 ('rival-171','Adi Putra','bronze-opportunist-v1',10171),
 ('rival-172','Sari Dewi','silver-opportunist-v1',10172),
 ('rival-173','Budi Hadi','gold-opportunist-v1',10173),
 ('rival-174','Ayu Sari','platinum-opportunist-v1',10174),
 ('rival-175','Rina Tan','diamond-opportunist-v1',10175),
 ('rival-176','Niran Chai','bronze-tracker-v1',10176),
 ('rival-177','Mali Arun','silver-tracker-v1',10177),
 ('rival-178','Somchai Lek','gold-tracker-v1',10178),
 ('rival-179','Dara Sok','platinum-tracker-v1',10179),
 ('rival-180','Sophea Lim','diamond-tracker-v1',10180);
