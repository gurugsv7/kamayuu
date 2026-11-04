import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
async function database(){
 const d=new PGlite();
 await d.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema lotus_ranked; grant usage on schema lotus_ranked to service_role;
 create table lotus_ranked.settings(enabled boolean); insert into lotus_ranked.settings values(false);
 create table lotus_ranked.tickets(status text,expires_at timestamptz);
 create table lotus_ranked.jobs(status text,due_at timestamptz,lease_until timestamptz);
 create schema net; create table net.requests(headers jsonb);
 create function net.http_post(url text,headers jsonb,body jsonb,timeout_milliseconds integer) returns bigint
 language plpgsql as $$begin insert into net.requests values(headers);return 1;end$$;`);
 await d.exec(readFileSync(new URL('../supabase/migrations/20261104105505_ranked_single_use_worker_tokens.sql',import.meta.url),'utf8'));return d;
}
const query=async(d,sql,args=[]) => (await d.query(sql,args)).rows[0];
test('worker tokens are hashed, expire, and authorize exactly once',async()=>{
 const d=await database();try{
  const {token}=await query(d,'select lotus_ranked.issue_worker_token() as token');
  const row=await query(d,'select token_hash,expires_at>now() as future from lotus_ranked.worker_tokens');
  assert.notEqual(row.token_hash,token);assert.equal(row.future,true);
  await d.exec('set role service_role');
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',[token])).ok,true);
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',[token])).ok,false);
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',['bad'])).ok,false);
  await d.exec('reset role');
  const expired=await query(d,'select lotus_ranked.issue_worker_token() as token');
  await d.exec("update lotus_ranked.worker_tokens set expires_at=now()-interval '1 second'");
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',[expired.token])).ok,false);
 }finally{await d.close();}
});
test('client roles cannot mint, read, or consume worker credentials; workers cannot mint',async()=>{
 const d=await database();try{
  for(const role of ['anon','authenticated','service_role']){
   await d.exec('set role '+role);
   await assert.rejects(()=>d.query('select lotus_ranked.issue_worker_token()'),/permission denied/);
   if(role!=='service_role'){
    await assert.rejects(()=>d.query('select * from lotus_ranked.worker_tokens'),/permission denied/);
    await assert.rejects(()=>d.query("select public.ranked_worker_authorized(repeat('0',64))"),/permission denied/);
   }
   await d.exec('reset role');
  }
 }finally{await d.close();}
});
test('disabled or idle dispatch makes no network calls; due work receives a one-use credential',async()=>{
 const d=await database();try{
  assert.equal((await query(d,'select lotus_ranked.dispatch_worker() id')).id,null);
  await d.exec('update lotus_ranked.settings set enabled=true');
  assert.equal((await query(d,'select lotus_ranked.dispatch_worker() id')).id,null);
  await d.exec("insert into lotus_ranked.jobs values('pending',now(),null)");
  assert.equal((await query(d,'select lotus_ranked.dispatch_worker() id')).id,1);
  const {headers}=await query(d,'select headers from net.requests');
  assert.match(headers.Authorization,/^Bearer [a-f0-9]{64}$/);
  const token=headers.Authorization.slice(7);
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',[token])).ok,true);
  assert.equal((await query(d,'select public.ranked_worker_authorized($1) ok',[token])).ok,false);
 }finally{await d.close();}
});
