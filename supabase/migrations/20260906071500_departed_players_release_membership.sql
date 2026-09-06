-- A player who leaves mid-match keeps their seat in `members` so the state's seat
-- indexes stay stable, but they should not keep holding a membership. Membership
-- gates realtime delivery and counts against the three-room limit in lotus_create,
-- so every abandoned room kept a slot until the 24h sweep and a host who left and
-- re-hosted a few times hit "Leave an existing room before creating another."
-- Departed players now release their membership on the next commit.
create or replace function public.lotus_commit(p_id uuid,p_version integer,p_data jsonb,p_packets jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare packet jsonb; member jsonb; departed jsonb;
begin
 update lotus_private.rooms set data=p_data,version=version+1,updated_at=now() where id=p_id and version=p_version;
 if not found then return false; end if;
 departed:=coalesce(p_data->'departed','[]'::jsonb);
 delete from public.lotus_memberships where room_id=p_id and (
  user_id not in(select (m->>'id')::uuid from jsonb_array_elements(p_data->'members') m)
  or departed @> to_jsonb(user_id::text));
 for member in select value from jsonb_array_elements(p_data->'members') loop
  if not departed @> to_jsonb(member->>'id') then
   insert into public.lotus_memberships values(p_id,(member->>'id')::uuid) on conflict do nothing;
  end if;
 end loop;
 for packet in select value from jsonb_array_elements(p_packets) loop
  perform realtime.send(packet->'payload','sync','lotus:'||p_id::text||':player:'||(packet->>'user_id'),true);
 end loop;
 if p_data->'state'->>'phase'='finished' then
  insert into lotus_private.results(match_id,room_id,summary) values((p_data->>'matchId')::uuid,p_id,
   jsonb_build_object('members',p_data->'members','winners',p_data->'state'->'winners','totals',p_data->'state'->'totals')) on conflict do nothing;
  -- Stats move only here, on the server's own view of who won.
  if found then
   perform public.lotus_record_result(
    coalesce((select array_agg(((p_data->'members'->(w::int))->>'id')::uuid)
              from jsonb_array_elements_text(p_data->'state'->'winners') w), '{}'::uuid[]),
    coalesce((select array_agg((m->>'id')::uuid)
              from jsonb_array_elements(p_data->'members') m), '{}'::uuid[]));
  end if;
 end if;
 return true;
end $$;
revoke all on function public.lotus_commit(uuid,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.lotus_commit(uuid,integer,jsonb,jsonb) to service_role;

-- Release the memberships already stranded by rooms their players had left. The
-- function above prevents new ones; this clears the backlog that is currently
-- holding hosts at the limit.
delete from public.lotus_memberships m
using lotus_private.rooms r
where r.id=m.room_id
  and coalesce(r.data->'departed','[]'::jsonb) @> to_jsonb(m.user_id::text);
