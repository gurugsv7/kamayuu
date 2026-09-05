create or replace function public.lotus_commit(p_id uuid,p_version integer,p_data jsonb,p_packets jsonb) returns boolean language plpgsql security invoker set search_path='' as $$
declare packet jsonb; member jsonb;
begin
 update lotus_private.rooms set data=p_data,version=version+1,updated_at=now() where id=p_id and version=p_version;
 if not found then return false; end if;
 delete from public.lotus_memberships where room_id=p_id and user_id not in(select (m->>'id')::uuid from jsonb_array_elements(p_data->'members') m);
 for member in select value from jsonb_array_elements(p_data->'members') loop
  insert into public.lotus_memberships values(p_id,(member->>'id')::uuid) on conflict do nothing;
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
