-- Hosted backstop for durable ranked jobs. No always-on laptop is required.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$ begin
 if not exists(select 1 from vault.secrets where name='kamayuu_ranked_worker_v1') then
  perform vault.create_secret(replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''),'kamayuu_ranked_worker_v1','Scoped ranked-worker invocation credential; never a service-role key');
 end if;
end $$;
-- A boolean-only lookup keeps Vault contents private to the database owner.
create function lotus_ranked.check_worker_token(p_token text) returns boolean
language sql security definer set search_path='' as $$
 select coalesce(length(p_token)=64 and exists(select 1 from vault.decrypted_secrets where name='kamayuu_ranked_worker_v1' and decrypted_secret=p_token),false)
$$;
revoke all on function lotus_ranked.check_worker_token(text) from public,anon,authenticated;
grant execute on function lotus_ranked.check_worker_token(text) to service_role;
create function public.ranked_worker_authorized(p_token text) returns boolean
language sql security invoker set search_path='' as $$
 select lotus_ranked.check_worker_token(p_token)
$$;
revoke all on function public.ranked_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.ranked_worker_authorized(text) to service_role;

create function lotus_ranked.dispatch_worker() returns bigint
language plpgsql security invoker set search_path='' as $$
declare request_id bigint; worker_token text;
begin
 if not exists(select 1 from lotus_ranked.settings where enabled) then return null; end if;
 if not exists(select 1 from lotus_ranked.tickets where status='waiting' and expires_at>now())
 and not exists(select 1 from lotus_ranked.jobs where status='pending' and due_at<=now() or status='claimed' and lease_until<now()) then return null; end if;
 select decrypted_secret into strict worker_token from vault.decrypted_secrets where name='kamayuu_ranked_worker_v1';
 select net.http_post(url:='https://ljbysmgzqohvlkcdctyj.supabase.co/functions/v1/lotus-ranked-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_token),body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function lotus_ranked.dispatch_worker() from public,anon,authenticated;
-- The cron job runs as its database owner. It is staged inactive until release.
do $$ declare job bigint; begin
 job:=cron.schedule('kamayuu-ranked-worker','2 seconds','select lotus_ranked.dispatch_worker()');
 perform cron.alter_job(job,active:=false);
end $$;
create index family_guardian_accounts on lotus_family.accounts(guardian) where guardian is not null;
