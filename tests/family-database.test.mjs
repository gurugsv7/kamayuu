import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
const migration=name=>readFileSync(new URL(`../supabase/migrations/${name}.sql`,import.meta.url),'utf8');
const uid='00000000-0000-4000-8000-000000000001';
const grant={receipt:'receipt-1',guardian:'parent-1',deviceHash:'a'.repeat(64),notice:'family-2026-11-v1',expiresAt:'2030-01-01T00:00:00Z',online:true,social:false,rematches:false};
async function db(){const d=new PGlite();await d.exec(`create role anon; create role authenticated; create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create table public.profiles(id uuid primary key references auth.users on delete cascade,display_name text,avatar text);grant usage on schema auth to service_role;grant select,insert,delete on auth.users to service_role;grant all on profiles to service_role;create schema lotus_private;create table lotus_private.rooms(id uuid primary key,data jsonb);create table lotus_private.results(room_id uuid,summary jsonb);create table lotus_private.rate_limits(user_id uuid);`);
 for(const name of ['20261104043814_ranked_infrastructure','20261104045454_ranked_named_rivals_fast_queue','20261104050547_ranked_rematches_social_preferences','20261104075508_family_safety'])await d.exec(migration(name));return d;}
const rpc=async(d,name,args=[])=> (await d.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) as value`,args)).rows[0].value;
async function child(d){const id=await rpc(d,'family_claim',[grant]);await d.query('insert into auth.users values($1)',[id]);await rpc(d,'family_activate',[id,grant]);return id;}
test('private consent RPCs reject client roles, child age cannot be upgraded and profile aliases cannot be changed',async()=>{
 const d=await db();try{const id=await child(d);await rpc(d,'family_register',[id,'18_plus']);assert.equal((await rpc(d,'family_state',[id])).age_band,'under_13');
 await d.query('insert into profiles values($1,$2,$3)',[id,'Real Name','star']);assert.match((await d.query('select display_name from profiles')).rows[0].display_name,/^Lotus-/);
 await d.query('update profiles set id=$1,display_name=$2 where id=$3',[uid,'Another Real Name',id]);assert.match((await d.query('select display_name from profiles where id=$1',[id])).rows[0].display_name,/^Lotus-/);
 await d.exec('set role authenticated');await assert.rejects(()=>rpc(d,'family_manage',['parent-1',id,{online:true}]),/permission denied/);await d.exec('reset role');
 await assert.rejects(()=>rpc(d,'family_manage',['wrong-parent',id,{online:false}]),/not found/);
 assert.equal(await rpc(d,'family_claim',[grant]),id);await assert.rejects(()=>rpc(d,'family_claim',[{...grant,deviceHash:'b'.repeat(64)}]),/unavailable/);
 }finally{await d.close();}
});
test('parent disable removes queue tickets and blocks subsequent allocation; child analytics never grants itself permissions',async()=>{
 const d=await db();try{const id=await child(d);await d.exec('update lotus_ranked.settings set enabled=true');await rpc(d,'ranked_acknowledge',[id,'ranked-ai-v1']);await rpc(d,'ranked_enqueue_ticket',[id,'ap-south-1']);
 assert.equal((await d.query('select count(*)::int n from lotus_ranked.tickets')).rows[0].n,1);
 await rpc(d,'family_manage',['parent-1',id,{online:false}]);assert.equal((await d.query('select count(*)::int n from lotus_ranked.tickets')).rows[0].n,0);
 await assert.rejects(()=>rpc(d,'ranked_enqueue_ticket',[id,'ap-south-1']),/approval required/);
 await rpc(d,'family_manage',['parent-1',id,{revoke:true}]);await assert.rejects(()=>rpc(d,'family_claim',[grant]),/unavailable/);
 }finally{await d.close();}
});
test('purge removes shared match payloads and restrictive references before auth deletion',async()=>{
 const d=await db();try{const id=await child(d);await d.exec('update lotus_ranked.settings set enabled=true');await rpc(d,'ranked_acknowledge',[id,'ranked-ai-v1']);await rpc(d,'ranked_enqueue_ticket',[id,'ap-south-1']);await d.query("update lotus_ranked.tickets set joined_at=now()-interval '5 seconds'");const match=await rpc(d,'ranked_pair',['ap-south-1']);assert.ok(match);
 await rpc(d,'family_purge',[id]);await d.query('delete from auth.users where id=$1',[id]);assert.equal((await d.query('select count(*)::int n from lotus_ranked.matches')).rows[0].n,0);assert.equal((await d.query('select revoked from lotus_family.receipts')).rows[0].revoked,true);
 }finally{await d.close();}
});

test('offline-only release rejects consented children and preserves adult queue admission',async()=>{
 const d=await db();try{
  const id=await child(d);await d.exec('update lotus_ranked.settings set enabled=true');
  await rpc(d,'ranked_acknowledge',[id,'ranked-ai-v1']);
  await d.exec(migration('20261104110514_under13_offline_only'));
  assert.equal((await d.query('select count(*)::int n from lotus_ranked.tickets')).rows[0].n,0);
  await assert.rejects(()=>rpc(d,'ranked_enqueue_ticket',[id,'ap-south-1']),/13 and above/);
  await d.query('insert into auth.users values($1)',[uid]);await rpc(d,'family_register',[uid,'18_plus']);
  await rpc(d,'ranked_acknowledge',[uid,'ranked-ai-v1']);await rpc(d,'ranked_enqueue_ticket',[uid,'ap-south-1']);
  assert.equal((await d.query('select count(*)::int n from lotus_ranked.tickets')).rows[0].n,1);
 }finally{await d.close();}
});
