-- Private, service-only safety state. User-editable JWT metadata is never used.
create schema if not exists lotus_family;
revoke all on schema lotus_family from public, anon, authenticated;
grant usage on schema lotus_family to service_role;
create table lotus_family.accounts (
 user_id uuid primary key references auth.users(id) on delete cascade,
 age_band text not null check(age_band in ('under_13','13_17','18_plus')),
 guardian text, consent boolean not null default false,
 online_allowed boolean not null default false, social_allowed boolean not null default false,
 rematches_allowed boolean not null default false, revoked boolean not null default false,
 alias text not null, updated_at timestamptz not null default now()
);
create table lotus_family.receipts (
 receipt text primary key, guardian text not null, device_hash text not null,
 user_id uuid not null unique default gen_random_uuid(), expires_at timestamptz not null,
 notice text not null, revoked boolean not null default false
);
alter table lotus_family.accounts enable row level security;
alter table lotus_family.receipts enable row level security;
grant all on all tables in schema lotus_family to service_role;

create function public.family_state(p_user uuid) returns jsonb language sql security invoker
set search_path = '' as $$
 select coalesce((select (to_jsonb(a)-'guardian')||jsonb_build_object('revoked',a.revoked or
 (a.age_band='under_13' and not exists(select 1 from lotus_family.receipts r where r.user_id=a.user_id and not r.revoked and r.expires_at>now())))
 from lotus_family.accounts a where user_id=p_user),'{}'::jsonb)
$$;
create function public.family_register(p_user uuid,p_age text) returns jsonb language plpgsql security invoker
set search_path = '' as $$
begin
 if p_age not in ('13_17','18_plus') then raise exception 'Verified parent approval required'; end if;
 insert into lotus_family.accounts(user_id,age_band,alias)
 values(p_user,p_age,'Player-'||substr(replace(p_user::text,'-',''),1,8)) on conflict do nothing;
 -- A known child's classification cannot be upgraded by a client declaration.
 return public.family_state(p_user);
end $$;
create function public.family_claim(p_grant jsonb) returns uuid language plpgsql security invoker
set search_path = '' as $$
declare r lotus_family.receipts;
begin
 if p_grant->>'notice'<>'family-2026-11-v1' or (p_grant->>'expiresAt')::timestamptz<=now()
 or p_grant->>'deviceHash' !~ '^[a-f0-9]{64}$' then raise exception 'Invalid consent'; end if;
 insert into lotus_family.receipts(receipt,guardian,device_hash,expires_at,notice)
 values(p_grant->>'receipt',p_grant->>'guardian',p_grant->>'deviceHash',(p_grant->>'expiresAt')::timestamptz,p_grant->>'notice') on conflict do nothing;
 select * into strict r from lotus_family.receipts where receipt=p_grant->>'receipt' for update;
 if r.revoked or r.expires_at<=now() or r.guardian<>p_grant->>'guardian' or r.device_hash<>p_grant->>'deviceHash' then raise exception 'Consent unavailable'; end if;
 return r.user_id;
end $$;
create function public.family_activate(p_user uuid,p_grant jsonb) returns jsonb language plpgsql security invoker
set search_path = '' as $$
begin
 if public.family_claim(p_grant)<>p_user then raise exception 'Wrong child'; end if;
 insert into lotus_family.accounts(user_id,age_band,guardian,consent,online_allowed,social_allowed,rematches_allowed,alias)
 values(p_user,'under_13',p_grant->>'guardian',true,(p_grant->>'online')::boolean,(p_grant->>'social')::boolean,(p_grant->>'rematches')::boolean,
 'Lotus-'||substr(replace(p_user::text,'-',''),1,8)) on conflict do nothing;
 perform public.ranked_preferences(p_user,coalesce((select rematches_allowed and online_allowed and not revoked from lotus_family.accounts where user_id=p_user),false));
 return public.family_state(p_user);
end $$;
create function public.family_manage(p_guardian text,p_user uuid,p_settings jsonb) returns jsonb language plpgsql security invoker
set search_path = '' as $$
begin
 update lotus_family.accounts set online_allowed=coalesce((p_settings->>'online')::boolean,online_allowed),
 social_allowed=coalesce((p_settings->>'social')::boolean,social_allowed),
 rematches_allowed=coalesce((p_settings->>'rematches')::boolean,rematches_allowed),
 revoked=revoked or coalesce((p_settings->>'revoke')::boolean,false), updated_at=now()
 where user_id=p_user and guardian=p_guardian and age_band='under_13';
 if not found then raise exception 'Child account not found'; end if;
 perform public.ranked_preferences(p_user,coalesce((select rematches_allowed and not revoked and online_allowed from lotus_family.accounts where user_id=p_user),false));
 delete from lotus_ranked.tickets where user_id=p_user and not (select online_allowed and not revoked from lotus_family.accounts where user_id=p_user);
 if coalesce((p_settings->>'revoke')::boolean,false) then
 update lotus_family.receipts set revoked=true where user_id=p_user;
 end if;
 return public.family_state(p_user);
end $$;
create function public.family_children(p_guardian text) returns jsonb language sql security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(a)-'guardian'),'[]'::jsonb) from lotus_family.accounts a where guardian=p_guardian
$$;
-- Authenticated profile writes need this narrow trigger because clients can
-- reach profiles directly. It only canonicalizes child aliases; it grants no API.
create function lotus_family.protect_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare safe_alias text;
begin
 if tg_op='UPDATE' then new.id=old.id; end if;
 select alias into safe_alias from lotus_family.accounts where user_id=new.id and age_band='under_13';
 if safe_alias is not null then new.display_name=safe_alias; new.avatar='lotus'; end if;
 return new;
end $$;
create trigger family_profile before insert or update on public.profiles for each row execute function lotus_family.protect_profile();
revoke all on function lotus_family.protect_profile() from public,anon,authenticated;
revoke all on function public.family_state(uuid),public.family_register(uuid,text),public.family_claim(jsonb),public.family_activate(uuid,jsonb),public.family_manage(text,uuid,jsonb),public.family_children(text) from public,anon,authenticated;
grant execute on function public.family_state(uuid),public.family_register(uuid,text),public.family_claim(jsonb),public.family_activate(uuid,jsonb),public.family_manage(text,uuid,jsonb),public.family_children(text) to service_role;

-- No stale queued ticket may allocate a match after parent revocation.
create function lotus_family.guard_ranked() returns trigger language plpgsql security invoker set search_path='' as $$
declare a lotus_family.accounts;
begin
 select * into a from lotus_family.accounts where user_id=new.user_id for share;
 if not found or a.revoked or (a.age_band='under_13' and (not a.consent or not a.online_allowed or
 not exists(select 1 from lotus_family.receipts r where r.user_id=a.user_id and not r.revoked and r.expires_at>now()))) then raise exception 'Online approval required'; end if;
 return new;
end $$;
create trigger family_ranked_active before insert on lotus_ranked.active_users for each row execute function lotus_family.guard_ranked();
create trigger family_ranked_queue before insert or update on lotus_ranked.tickets for each row when(new.status='waiting') execute function lotus_family.guard_ranked();
revoke all on function lotus_family.guard_ranked() from public,anon,authenticated;

-- Remove linked gameplay data before Auth deletion (several old FKs restrict
-- deletion). Opponents retain their aggregate ratings, not shared match payloads.
create function public.family_purge(p_user uuid) returns void language plpgsql security invoker set search_path='' as $$
declare match_ids uuid[]; room_ids uuid[];
begin
 select coalesce(array_agg(match_id),'{}'::uuid[]) into match_ids from lotus_ranked.participants where user_id=p_user;
 update lotus_ranked.matches set parent_match_id=null where parent_match_id=any(match_ids);
 update lotus_ranked.rematches set next_match_id=null where next_match_id=any(match_ids);
 delete from lotus_ranked.rating_events where match_id=any(match_ids) or user_id=p_user;
 delete from lotus_ranked.results where match_id=any(match_ids);
 delete from lotus_ranked.rematches where match_id=any(match_ids);
 delete from lotus_ranked.jobs where match_id=any(match_ids);
 delete from lotus_ranked.active_users where match_id=any(match_ids) or user_id=p_user;
 delete from lotus_ranked.tickets where match_id=any(match_ids) or user_id=p_user;
 delete from lotus_ranked.participants where match_id=any(match_ids);
 delete from lotus_ranked.matches where id=any(match_ids);
 select coalesce(array_agg(id),'{}'::uuid[]) into room_ids from lotus_private.rooms where data::text like '%'||p_user::text||'%';
 delete from lotus_private.results where room_id=any(room_ids) or summary::text like '%'||p_user::text||'%';
 delete from lotus_private.rooms where id=any(room_ids);
 delete from lotus_private.rate_limits where user_id=p_user;
 update lotus_family.receipts set revoked=true where user_id=p_user;
 update lotus_family.accounts set revoked=true,online_allowed=false,social_allowed=false,rematches_allowed=false where user_id=p_user;
end $$;
revoke all on function public.family_purge(uuid) from public,anon,authenticated;
grant execute on function public.family_purge(uuid) to service_role;
