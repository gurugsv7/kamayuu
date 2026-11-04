// PGLITE_MODULE can point to an existing installation to avoid another download.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {rosterSql} from '../scripts/ranked-seed.mjs';
import {ratingChange, BOT_PROFILES} from '../lib/ranked-config.mjs';
import {handleRanked} from '../lib/ranked-service.mjs';
import {processRankedJob} from '../lib/ranked-worker.mjs';
import {aiView,chooseAction} from '../lib/engine.mjs';

const modulePath = process.env.PGLITE_MODULE;
const {PGlite} = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const migration = readFileSync(new URL('../supabase/migrations/20261104043814_ranked_infrastructure.sql', import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,display_name text);
    grant usage on schema auth to service_role; grant select on auth.users,public.profiles to service_role;`);
  await db.exec(migration);
  await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,20) n;`);
  return db;
}
async function rpc(db, name, args = []) {
  const r = await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`, args);
  return r.rows[0].value;
}
async function enter(db, n) {
  await rpc(db,'ranked_acknowledge',[uid(n),'ranked-ai-v1']);
  return rpc(db,'ranked_enqueue',[uid(n),'ap-south-1']);
}
async function age(db, n, seconds=13) {
  await db.query(`update lotus_ranked.tickets set joined_at=now()-make_interval(secs=>$1), expires_at=now()+interval '30 seconds' where user_id=$2`,[seconds,uid(n)]);
}

test('migration compiles, roster matches policy configuration, private RPCs reject clients', async () => {
  const db = await database();
  try {
    assert.ok(migration.endsWith(rosterSql()));
    assert.equal((await db.query('select count(*)::int as n from lotus_ranked.bot_profiles')).rows[0].n,15);
    await db.exec('set role authenticated');
    await assert.rejects(rpc(db,'ranked_status',[uid(1)]),/permission denied/);
    await assert.rejects(db.query('select * from lotus_ranked.ratings'),/permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).enabled,false);
  } finally {await db.close();}
});

test('first-entry acknowledgment persists, enqueue is idempotent, cancel wins before pairing', async () => {
  const db = await database();
  try {
    await assert.rejects(enter(db,1),/not open/);
    await db.exec('update lotus_ranked.settings set enabled=true');
    await assert.rejects(rpc(db,'ranked_enqueue',[uid(2),'ap-south-1']),/acknowledge/);
    await assert.rejects(rpc(db,'ranked_acknowledge',[uid(2),'old']),/changed/);
    const a = await enter(db,2);
    await age(db,2,6);
    const b = await enter(db,2);
    assert.equal(a.ticket.id,b.ticket.id);
    assert.equal(b.needsDisclosure,false);
    const joined = b.ticket.joined_at;
    assert.equal((await enter(db,2)).ticket.joined_at,joined);
    await rpc(db,'ranked_cancel_queue',[uid(2)]);
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
    await assert.rejects(rpc(db,'ranked_enqueue',[uid(2),'elsewhere']),/Unsupported/);
    await db.exec("update lotus_ranked.settings set disclosure_version='v2'");
    assert.equal((await rpc(db,'ranked_status',[uid(2)])).needsDisclosure,true);
  } finally {await db.close();}
});

test('human arrival at fallback time gets human match, no duplicate allocation', async () => {
  const db = await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1); await age(db,1); await enter(db,2);
    const match = await rpc(db,'ranked_pair',['ap-south-1']);
    const record = await rpc(db,'ranked_load_match',[match]);
    assert.deepEqual(record.participants.map(p=>p.kind),['human','human']);
    assert.equal((await enter(db,1)).activeMatchId,match);
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
    assert.equal((await rpc(db,'ranked_cancel_queue',[uid(1)])).activeMatchId,match);
  } finally {await db.close();}
});

test('15 entrants form seven human pairs and one delayed bot fallback; frozen roster snapshot', async () => {
  const db = await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    for(let n=1;n<=15;n++) await enter(db,n);
    for(let n=0;n<7;n++) assert.ok(await rpc(db,'ranked_pair',['ap-south-1']));
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
    await db.exec("update lotus_ranked.tickets set joined_at=now()-interval '13 seconds' where status='waiting'");
    const match = await rpc(db,'ranked_pair',['ap-south-1']);
    const record = await rpc(db,'ranked_load_match',[match]);
    assert.equal(record.participants[1].kind,'bot');
    const profile = record.participants[1].bot_config;
    assert.ok(BOT_PROFILES.some(p=>p.id===profile.id));
    await db.exec("update lotus_ranked.bot_profiles set config='{}'::jsonb");
    assert.deepEqual((await rpc(db,'ranked_load_match',[match])).participants[1].bot_config,profile);
    assert.equal((await db.query('select count(*)::int as n from lotus_ranked.active_users')).rows[0].n,15);
  } finally {await db.close();}
});

test('expired humans do not match, an isolated oldest ticket cannot block another pair', async () => {
  const db = await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    for(let n=1;n<=4;n++) await enter(db,n);
    await db.query('update lotus_ranked.tickets set rating=2000,joined_at=now()-interval \'6 seconds\' where user_id=$1',[uid(1)]);
    await db.query('update lotus_ranked.tickets set expires_at=now()-interval \'1 second\' where user_id=$1',[uid(4)]);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    const users=(await rpc(db,'ranked_load_match',[match])).participants.map(p=>p.user_id).sort();
    assert.deepEqual(users,[uid(2),uid(3)]);
  } finally {await db.close();}
});

test('job leases recover, stale workers cannot commit, terminal result updates rating once', async () => {
  const db = await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1); await enter(db,2);
    const match = await rpc(db,'ranked_pair',['ap-south-1']);
    const first = await rpc(db,'ranked_claim_job');
    assert.equal(await rpc(db,'ranked_claim_job'),null);
    await db.query("update lotus_ranked.jobs set lease_until=now()-interval '1 second' where id=$1",[first.id]);
    const second = await rpc(db,'ranked_claim_job');
    const data={state:{phase:'finished',winners:[0],totals:[10,20]}};
    assert.equal(await rpc(db,'ranked_commit',[match,0,data,null,{},first.id,first.claim_token]),false);
    assert.equal(await rpc(db,'ranked_commit',[match,0,data,null,{},second.id,second.claim_token]),true);
    assert.equal(await rpc(db,'ranked_commit',[match,0,data,null,{},second.id,second.claim_token]),false);
    const ratings=(await db.query('select rating,played from lotus_ranked.ratings order by user_id')).rows;
    assert.deepEqual(ratings,[{rating:616,played:1},{rating:584,played:1}]);
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).activeMatchId,null);
    assert.equal(await rpc(db,'ranked_abort',[match]),false);
  } finally {await db.close();}
});

test('bot result uses shared ladder with symmetric half weight; abort has no rating effect', async () => {
  const db = await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1); await age(db,1);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    const record=await rpc(db,'ranked_load_match',[match]);
    const data={state:{phase:'finished',winners:[0],totals:[10,20]}};
    assert.equal(await rpc(db,'ranked_commit',[match,0,data,null,{}]),true);
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).rating,600+ratingChange(600,record.participants[1].rating_before,1,'bot'));
    await enter(db,2); await age(db,2);
    const aborted=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.equal(await rpc(db,'ranked_abort',[aborted]),true);
    assert.equal((await rpc(db,'ranked_status',[uid(2)])).rating,600);
  } finally {await db.close();}
});

test('entry service and leased worker play a complete bot match, retries do not apply twice', async()=>{
  const db=await database();
  try {
    const transport=async(name,args={})=>{
      const entries=Object.entries(args);
      const result=await db.query(`select public.${name}(${entries.map(([key],i)=>`${key} => $${i+1}`).join(',')}) as value`,entries.map(([,v])=>v));
      return result.rows[0].value;
    };
    await db.exec('update lotus_ranked.settings set enabled=true');
    await handleRanked(transport,uid(1),{command:'acknowledge',version:'ranked-ai-v1'});
    await handleRanked(transport,uid(1),{command:'enqueue',region:'ap-south-1'});
    await age(db,1);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.equal((await handleRanked(transport,uid(1),{command:'recover',matchId:match})).pending,true);
    let job=await rpc(db,'ranked_claim_job');let now=Date.now();
    assert.equal(await processRankedJob(transport,job,now),true);
    const seen=await handleRanked(transport,uid(1),{command:'recover',matchId:match});
    assert.equal(seen.packet.state.deck,undefined);
    assert.equal(seen.packet.state.players[1].slots[2].rank,undefined);
    const first={command:'remember',matchId:match,actionId:uid(100)};
    const remembered=await handleRanked(transport,uid(1),first,now);
    const duplicate=await handleRanked(transport,uid(1),first,now);
    assert.equal(remembered.packet.room.version,duplicate.packet.room.version);
    for(let guard=0;guard<500;guard++) {
      const record=await rpc(db,'ranked_load_match',[match]);
      if(record.status==='finished')break;
      const s=record.data.state;
      if(s.active===0 && !['memory','lastCall'].includes(s.phase)) {
        await handleRanked(transport,uid(1),{command:'action',matchId:match,version:record.version,
          actionId:uid(1000+guard),action:chooseAction(aiView(s,0),()=>0.5)},now);
      } else {
        const scheduled=await rpc(db,'ranked_next_job',[match]);
        now=Math.max(now,Date.parse(scheduled.due_at));
        await db.query('update lotus_ranked.jobs set due_at=now() where id=$1',[scheduled.id]);
        job=await rpc(db,'ranked_claim_job');
        assert.equal(await processRankedJob(transport,job,now),true);
      }
    }
    assert.equal((await rpc(db,'ranked_load_match',[match])).status,'finished');
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).played,1);
    assert.equal(await rpc(db,'ranked_claim_job'),null);
  } finally {await db.close();}
});

test('exhausted worker retries atomically release the player without rating changes',async()=>{
  const db=await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1);await age(db,1);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    const job=await rpc(db,'ranked_claim_job');
    await db.query('update lotus_ranked.jobs set attempts=5 where id=$1',[job.id]);
    assert.equal(await rpc(db,'ranked_release_job',[job.id,job.claim_token,'test failure']),true);
    assert.equal((await rpc(db,'ranked_load_match',[match])).status,'cancelled');
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).activeMatchId,null);
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).played,0);
  } finally {await db.close();}
});
