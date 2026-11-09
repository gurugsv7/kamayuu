-- Shared standings. Cosmetic identity and personality seeds remain stable.
-- A rival starts near its configured tier rating; completed games contribute
-- the opposite of the human's recorded rating change. No simulated wins/games.
create or replace function lotus_ranked.rival_rating(p_identity text,p_season text) returns integer
language sql stable security invoker set search_path='' as $$
 select greatest(0,least(4000,p.rating+((i.seed-10001)/5)::int*4-70+
  coalesce((select sum(e.before_rating-e.after_rating)::int from lotus_ranked.participants b
   join lotus_ranked.matches m on m.id=b.match_id
   join lotus_ranked.rating_events e on e.match_id=m.id
   where b.bot_identity_id=i.id and m.season=p_season),0)))::int
 from lotus_ranked.bot_identities i join lotus_ranked.bot_profiles p on p.id=i.profile_id where i.id=p_identity
$$;
revoke all on function lotus_ranked.rival_rating(text,text) from public,anon,authenticated;
grant execute on function lotus_ranked.rival_rating(text,text) to service_role;

-- All allocation paths (including rematches) snapshot the same current rating.
create or replace function lotus_ranked.snapshot_rival_rating() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if new.kind='bot' and new.bot_identity_id is not null then
  new.rating_before:=lotus_ranked.rival_rating(new.bot_identity_id,(select season from lotus_ranked.matches where id=new.match_id));
 end if;
 return new;
end $$;
revoke all on function lotus_ranked.snapshot_rival_rating() from public,anon,authenticated;
grant execute on function lotus_ranked.snapshot_rival_rating() to service_role;
create trigger snapshot_rival_rating before insert on lotus_ranked.participants
for each row execute function lotus_ranked.snapshot_rival_rating();

create or replace function public.ranked_leaderboard(p_user uuid,p_limit integer default 50,p_offset integer default 0) returns jsonb
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
 ), page as (select * from ranked order by rank limit p_limit offset p_offset)
 select coalesce(jsonb_agg(to_jsonb(page) order by rank),'[]'::jsonb),(select count(*) from all_entries) into entries,total from page;
 return jsonb_build_object('season',cfg.season,'entries',entries,'total',total,'offset',p_offset);
end $$;
revoke all on function public.ranked_leaderboard(uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.ranked_leaderboard(uuid,integer,integer) to service_role;

-- Stable rival handles
update lotus_ranked.bot_identities i set name=v.name from (values
 ('rival-001','Aarav'),
 ('rival-002','vivaan_07'),
 ('rival-003','AdityaPlays'),
 ('rival-004','vihaan.exe'),
 ('rival-005','Arjun_gg'),
 ('rival-006','SaiRush'),
 ('rival-007','heyReyansh'),
 ('rival-008','ayaan_x'),
 ('rival-009','KrishnaAce'),
 ('rival-010','ishaan99'),
 ('rival-011','ShauryaChill'),
 ('rival-012','Atharv_OP'),
 ('rival-013','Advik'),
 ('rival-014','pranav_07'),
 ('rival-015','KabirPlays'),
 ('rival-016','ritvik.exe'),
 ('rival-017','Dhruv_gg'),
 ('rival-018','AryanRush'),
 ('rival-019','heyYuvan'),
 ('rival-020','ved_x'),
 ('rival-021','AnanyaAce'),
 ('rival-022','diya99'),
 ('rival-023','AadhyaChill'),
 ('rival-024','Saanvi_OP'),
 ('rival-025','Myra'),
 ('rival-026','aanya_07'),
 ('rival-027','IraPlays'),
 ('rival-028','kiara.exe'),
 ('rival-029','Avni_gg'),
 ('rival-030','PariRush'),
 ('rival-031','heyNavya'),
 ('rival-032','riya_x'),
 ('rival-033','AnikaAce'),
 ('rival-034','sara99'),
 ('rival-035','MeeraChill'),
 ('rival-036','Tara_OP'),
 ('rival-037','Ishita'),
 ('rival-038','nitya_07'),
 ('rival-039','KavyaPlays'),
 ('rival-040','veda.exe'),
 ('rival-041','Karthik_gg'),
 ('rival-042','SuryaRush'),
 ('rival-043','heyVijay'),
 ('rival-044','ashwin_x'),
 ('rival-045','NaveenAce'),
 ('rival-046','prakash99'),
 ('rival-047','HarishChill'),
 ('rival-048','Dinesh_OP'),
 ('rival-049','Ganesh'),
 ('rival-050','vignesh_07'),
 ('rival-051','AjayPlays'),
 ('rival-052','sanjay.exe'),
 ('rival-053','Deepak_gg'),
 ('rival-054','VarunRush'),
 ('rival-055','heyRohit'),
 ('rival-056','sathish_x'),
 ('rival-057','ManojAce'),
 ('rival-058','nikhil99'),
 ('rival-059','AkashChill'),
 ('rival-060','Bharath_OP'),
 ('rival-061','Janani'),
 ('rival-062','divya_07'),
 ('rival-063','PriyaPlays'),
 ('rival-064','sneha.exe'),
 ('rival-065','Keerthi_gg'),
 ('rival-066','PavithraRush'),
 ('rival-067','heyHarini'),
 ('rival-068','nandini_x'),
 ('rival-069','ShreyaAce'),
 ('rival-070','swathi99'),
 ('rival-071','LakshmiChill'),
 ('rival-072','Deepa_OP'),
 ('rival-073','Gayathri'),
 ('rival-074','revathi_07'),
 ('rival-075','MaliniPlays'),
 ('rival-076','sandhya.exe'),
 ('rival-077','Anjali_gg'),
 ('rival-078','AmalaRush'),
 ('rival-079','heyBhavna'),
 ('rival-080','yamini_x'),
 ('rival-081','DevAce'),
 ('rival-082','rohan99'),
 ('rival-083','NeelChill'),
 ('rival-084','Aman_OP'),
 ('rival-085','Rahul'),
 ('rival-086','kunal_07'),
 ('rival-087','TanmayPlays'),
 ('rival-088','yash.exe'),
 ('rival-089','Om_gg'),
 ('rival-090','SamarRush'),
 ('rival-091','heyParth'),
 ('rival-092','sahil_x'),
 ('rival-093','RishiAce'),
 ('rival-094','mihir99'),
 ('rival-095','AnshChill'),
 ('rival-096','Tushar_OP'),
 ('rival-097','Nitin'),
 ('rival-098','vivek_07'),
 ('rival-099','TejasPlays'),
 ('rival-100','abhay.exe'),
 ('rival-101','Neha_gg'),
 ('rival-102','PoojaRush'),
 ('rival-103','heySana'),
 ('rival-104','aditi_x'),
 ('rival-105','SimranAce'),
 ('rival-106','kriti99'),
 ('rival-107','RheaChill'),
 ('rival-108','Naina_OP'),
 ('rival-109','Sonal'),
 ('rival-110','mahi_07'),
 ('rival-111','JiyaPlays'),
 ('rival-112','trisha.exe'),
 ('rival-113','Esha_gg'),
 ('rival-114','RupaliRush'),
 ('rival-115','heyTanvi'),
 ('rival-116','palak_x'),
 ('rival-117','AishaAce'),
 ('rival-118','sakshi99'),
 ('rival-119','IshaChill'),
 ('rival-120','Zoya_OP'),
 ('rival-121','Arnav'),
 ('rival-122','soham_07'),
 ('rival-123','IshanPlays'),
 ('rival-124','rudra.exe'),
 ('rival-125','Niloy_gg'),
 ('rival-126','DebRush'),
 ('rival-127','heyAnirban'),
 ('rival-128','joy_x'),
 ('rival-129','ArkaAce'),
 ('rival-130','ritam99'),
 ('rival-131','AnushkaChill'),
 ('rival-132','Sohini_OP'),
 ('rival-133','Oindrila'),
 ('rival-134','roshni_07'),
 ('rival-135','MoumitaPlays'),
 ('rival-136','ritu.exe'),
 ('rival-137','Mitali_gg'),
 ('rival-138','PiyaRush'),
 ('rival-139','heyKeya'),
 ('rival-140','rini_x'),
 ('rival-141','MinhAce'),
 ('rival-142','linh99'),
 ('rival-143','BaoChill'),
 ('rival-144','Mai_OP'),
 ('rival-145','An'),
 ('rival-146','huy_07'),
 ('rival-147','ThaoPlays'),
 ('rival-148','nam.exe'),
 ('rival-149','Nhi_gg'),
 ('rival-150','DuyRush'),
 ('rival-151','heyWei'),
 ('rival-152','mei_x'),
 ('rival-153','JunAce'),
 ('rival-154','jia99'),
 ('rival-155','HaoChill'),
 ('rival-156','Xin_OP'),
 ('rival-157','Yan'),
 ('rival-158','tao_07'),
 ('rival-159','NingPlays'),
 ('rival-160','lei.exe'),
 ('rival-161','Haru_gg'),
 ('rival-162','YuiRush'),
 ('rival-163','heyRen'),
 ('rival-164','aoi_x'),
 ('rival-165','SoraAce'),
 ('rival-166','mina99'),
 ('rival-167','JoonChill'),
 ('rival-168','Yuna_OP'),
 ('rival-169','Jiho'),
 ('rival-170','ara_07'),
 ('rival-171','AdiPlays'),
 ('rival-172','sari.exe'),
 ('rival-173','Budi_gg'),
 ('rival-174','AyuRush'),
 ('rival-175','heyRina'),
 ('rival-176','niran_x'),
 ('rival-177','MaliAce'),
 ('rival-178','somchai99'),
 ('rival-179','DaraChill'),
 ('rival-180','Sophea_OP')
) as v(id,name) where i.id=v.id;
