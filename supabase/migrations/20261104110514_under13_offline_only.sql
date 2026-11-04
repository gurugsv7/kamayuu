-- First release: known under-13 accounts cannot enter online matchmaking.
create or replace function lotus_family.guard_ranked() returns trigger
language plpgsql security invoker set search_path='' as $$
declare a lotus_family.accounts;
begin
 select * into a from lotus_family.accounts where user_id=new.user_id for share;
 if not found or a.revoked then raise exception 'Complete age setup before online play'; end if;
 if a.age_band='under_13' then raise exception 'Online play is available for ages 13 and above'; end if;
 return new;
end $$;
revoke all on function lotus_family.guard_ranked() from public,anon,authenticated;
