-- Single-use worker credentials: no reusable Vault credential enters pg_net.
create table lotus_ranked.worker_tokens (
 token_hash text primary key check(length(token_hash)=64),
 expires_at timestamptz not null
);
create index ranked_worker_token_expiry on lotus_ranked.worker_tokens(expires_at);
alter table lotus_ranked.worker_tokens enable row level security;
revoke all on lotus_ranked.worker_tokens from public,anon,authenticated;
grant select,delete on lotus_ranked.worker_tokens to service_role;

create function lotus_ranked.issue_worker_token() returns text
language plpgsql security invoker set search_path='' as $$
declare token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
begin
 delete from lotus_ranked.worker_tokens where expires_at<=clock_timestamp();
 insert into lotus_ranked.worker_tokens(token_hash,expires_at)
 values(encode(sha256(convert_to(token,'UTF8')),'hex'),clock_timestamp()+interval '30 seconds');
 return token;
end $$;
revoke all on function lotus_ranked.issue_worker_token() from public,anon,authenticated,service_role;

create or replace function lotus_ranked.check_worker_token(p_token text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare accepted boolean;
begin
 if p_token is null or p_token !~ '^[a-f0-9]{64}$' then return false; end if;
 delete from lotus_ranked.worker_tokens
 where token_hash=encode(sha256(convert_to(p_token,'UTF8')),'hex') and expires_at>clock_timestamp()
 returning true into accepted;
 return coalesce(accepted,false);
end $$;
revoke all on function lotus_ranked.check_worker_token(text) from public,anon,authenticated;
grant execute on function lotus_ranked.check_worker_token(text) to service_role;

create or replace function public.ranked_worker_authorized(p_token text) returns boolean
language sql security invoker set search_path='' as $$
 select lotus_ranked.check_worker_token(p_token)
$$;
revoke all on function public.ranked_worker_authorized(text) from public,anon,authenticated;
grant execute on function public.ranked_worker_authorized(text) to service_role;

create or replace function lotus_ranked.dispatch_worker() returns bigint
language plpgsql security invoker set search_path='' as $$
declare request_id bigint; worker_token text;
begin
 if not exists(select 1 from lotus_ranked.settings where enabled) then return null; end if;
 delete from lotus_ranked.worker_tokens where expires_at<=clock_timestamp();
 if not exists(select 1 from lotus_ranked.tickets where status='waiting' and expires_at>now())
 and not exists(select 1 from lotus_ranked.jobs where (status='pending' and due_at<=now()) or (status='claimed' and lease_until<now())) then return null; end if;
 worker_token:=lotus_ranked.issue_worker_token();
 select net.http_post(url:='https://ljbysmgzqohvlkcdctyj.supabase.co/functions/v1/lotus-ranked-worker',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||worker_token),
  body:='{}'::jsonb,timeout_milliseconds:=15000) into request_id;
 return request_id;
end $$;
revoke all on function lotus_ranked.dispatch_worker() from public,anon,authenticated;
