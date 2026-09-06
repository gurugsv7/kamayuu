-- The three-room limit counted every membership, including tables whose match had
-- already finished. A player who played three matches and closed the app — rather
-- than pressing Leave on the results screen — was locked out of creating another
-- room until the 24h sweep, with no way to clear it from inside the game.
-- A finished table is over, so it no longer occupies one of the three slots.
-- Lobbies and matches still in play continue to count.
create or replace function public.lotus_create(p_id uuid,p_code text,p_data jsonb,p_user uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
declare result jsonb;
begin
 delete from lotus_private.rooms where updated_at<now()-interval '24 hours';
 delete from lotus_private.rate_limits where window_start<now()-interval '1 day';
 if (select count(*) from public.lotus_memberships m
     join lotus_private.rooms r on r.id=m.room_id
     where m.user_id=p_user
       and coalesce(r.data->'state'->>'phase','') <> 'finished')>=3
 then raise exception 'Leave an existing room before creating another.'; end if;
 insert into lotus_private.rooms(id,code,data) values(p_id,p_code,p_data);
 insert into public.lotus_memberships values(p_id,p_user);
 select to_jsonb(r) into result from lotus_private.rooms r where id=p_id;
 return result;
end $$;
revoke all on function public.lotus_create(uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function public.lotus_create(uuid,text,jsonb,uuid) to service_role;

-- Release the seats already held by finished tables, so anyone blocked right now
-- is unblocked immediately rather than waiting for the sweep.
delete from public.lotus_memberships m
using lotus_private.rooms r
where r.id=m.room_id
  and coalesce(r.data->'state'->>'phase','') = 'finished';
