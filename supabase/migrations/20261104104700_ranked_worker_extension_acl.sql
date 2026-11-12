-- Extension defaults must not expose queued Authorization headers or scheduler state.
-- Platform-owned grants may survive REVOKE when the deploy role is not the owner.
-- Verify effective ACLs; see docs/backend-deployment.md for the hosted project result.
revoke all on schema net,cron from public,anon,authenticated;
revoke all on all tables in schema net,cron from public,anon,authenticated;
revoke all on all functions in schema net,cron from public,anon,authenticated;
-- Rotate the scoped token after tightening extension defaults. Never return it.
do $$ begin
 perform vault.update_secret((select id from vault.secrets where name='kamayuu_ranked_worker_v1'),
  replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''));
end $$;
