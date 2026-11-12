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
import {BOT_IDENTITIES} from '../lib/ranked-roster.mjs';
import {identityRosterSql} from '../scripts/ranked-roster-seed.mjs';

const modulePath = process.env.PGLITE_MODULE;
const {PGlite} = await import(modulePath ? pathToFileURL(modulePath).href : '@electric-sql/pglite');
const migration = readFileSync(new URL('../supabase/migrations/20261104043814_ranked_infrastructure.sql', import.meta.url), 'utf8');
const rivalsMigration = readFileSync(new URL('../supabase/migrations/20261104045454_ranked_named_rivals_fast_queue.sql', import.meta.url), 'utf8');
const uid = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;

async function database() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key);
    create table public.profiles(id uuid primary key,display_name text);
    grant usage on schema auth to service_role; grant select on auth.users,public.profiles to service_role;`);
  await db.exec(migration);
  await db.exec(rivalsMigration);
  await db.exec(readFileSync(new URL('../supabase/migrations/20261104050547_ranked_rematches_social_preferences.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261104115847_ranked_rematch_confirmation_delay.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261109222213_shared_rival_standings.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261109224447_ranked_progression_and_rival_motion.sql',import.meta.url),'utf8'));
  await db.exec(readFileSync(new URL('../supabase/migrations/20261109225218_leaderboard_search.sql',import.meta.url),'utf8'));
  await db.exec(`insert into auth.users select ('00000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,20) n;`);
  return db;
}
async function rpc(db, name, args = []) {
  const r = await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as value`, args);
  return r.rows[0].value;
}

test('leaderboard search spans every page, preserves global ranks and treats wildcard input literally',async()=>{
 const db=await database();try{
  await assert.rejects(rpc(db,'ranked_search_leaderboard',[uid(1),'a',50,0]),/acknowledge/);
  await rpc(db,'ranked_acknowledge',[uid(1),'ranked-ai-v1']);
  await db.query('insert into public.profiles(id,display_name) values($1,$2)',[uid(2),'Needle_%']);
  await db.query("insert into lotus_ranked.ratings(user_id,season,rating,played,wins) values($1,'launch-v1',20,1,0)",[uid(2)]);
  const target=await rpc(db,'ranked_search_leaderboard',[uid(1),' needle_ ',50,0]);
  assert.equal(target.total,1);assert.equal(target.entries[0].name,'Needle_%');assert.equal(target.entries[0].rank,181);
  assert.equal((await rpc(db,'ranked_search_leaderboard',[uid(1),'%',50,0])).total,1);
  assert.equal((await rpc(db,'ranked_search_leaderboard',[uid(1),"';select",50,0])).total,0);
  assert.deepEqual(await rpc(db,'ranked_search_leaderboard',[uid(1),' ',50,100]),await rpc(db,'ranked_leaderboard',[uid(1),50,100]));
  const first=await rpc(db,'ranked_search_leaderboard',[uid(1),'a',50,0]);
  const next=await rpc(db,'ranked_search_leaderboard',[uid(1),'A',50,50]);
  assert.ok(first.total>50);assert.equal(first.total,next.total);
  assert.equal(new Set([...first.entries,...next.entries].map(x=>x.entry_id)).size,first.entries.length+next.entries.length);
  await assert.rejects(rpc(db,'ranked_search_leaderboard',[uid(1),'a'.repeat(41),50,0]),/Invalid search/);
  await db.exec('set role authenticated');
  await assert.rejects(rpc(db,'ranked_search_leaderboard',[uid(1),'a',50,0]),/permission denied/);
 }finally{await db.close();}
});

test('database and client progression agree across tiers, caps and opponent gaps',async()=>{
 const db=await database();try{
  for(const rating of [0,600,899,900,1199,1200,1499,1500,1799,1800,3999,4000]) {
   for(const opponent of [0,600,1500,4000])for(const score of [0,0.5,1]) {
    const got=(await db.query('select lotus_ranked.progression_delta($1,$2,$3) as delta',[rating,opponent,score])).rows[0].delta;
    assert.equal(got,ratingChange(rating,opponent,score),`${rating}/${opponent}/${score}`);
   }
  }
  await assert.rejects(db.query('select lotus_ranked.progression_delta(-1,600,1)'),/Invalid/);
 }finally{await db.close();}
});

test('rival movement waits six hours, is bounded and idempotent, and creates no games or wins',async()=>{
 const db=await database();try{
  await db.exec('update lotus_ranked.settings set enabled=true');
  assert.equal((await db.query('select lotus_ranked.refresh_rival_motion() n')).rows[0].n,0);
  await db.exec("update lotus_ranked.rival_motion set adjusted_at=now()-interval '7 hours'");
  assert.equal((await db.query('select lotus_ranked.refresh_rival_motion() n')).rows[0].n,180);
  const moved=(await db.query('select identity_id,adjustment,adjusted_at from lotus_ranked.rival_motion order by identity_id')).rows;
  assert.ok(moved.every(x=>Math.abs(x.adjustment)<=12));
  assert.ok(new Set(moved.map(x=>x.adjustment)).size>2);
  assert.equal((await db.query('select lotus_ranked.refresh_rival_motion() n')).rows[0].n,0);
  assert.deepEqual((await db.query('select identity_id,adjustment,adjusted_at from lotus_ranked.rival_motion order by identity_id')).rows,moved);
  for(let n=0;n<15;n++) {
   await db.exec("update lotus_ranked.rival_motion set adjusted_at=now()-interval '7 hours'");
   await db.query('select lotus_ranked.refresh_rival_motion()');
  }
  assert.ok((await db.query('select max(abs(adjustment)) n from lotus_ranked.rival_motion')).rows[0].n<=120);
  for(const table of ['matches','results','rating_events','ratings'])assert.equal((await db.query(`select count(*)::int n from lotus_ranked.${table}`)).rows[0].n,0);
  await db.exec("update lotus_ranked.settings set enabled=false; update lotus_ranked.rival_motion set adjusted_at=now()-interval '7 hours'");
  assert.equal((await db.query('select lotus_ranked.refresh_rival_motion() n')).rows[0].n,0);
  await db.exec('set role authenticated');
  await assert.rejects(db.query('select lotus_ranked.refresh_rival_motion()'),/permission denied/);
 }finally{await db.close();}
});
async function enter(db, n) {
  await rpc(db,'ranked_acknowledge',[uid(n),'ranked-ai-v1']);
  // Stage tickets explicitly when testing the pairer's individual transactions.
  // Public enqueue's immediate pairing is exercised separately below.
  return rpc(db,'ranked_enqueue_ticket',[uid(n),'ap-south-1']);
}
async function age(db, n, seconds=13) {
  await db.query(`update lotus_ranked.tickets set joined_at=now()-make_interval(secs=>$1), expires_at=now()+interval '30 seconds' where user_id=$2`,[seconds,uid(n)]);
}

async function finishedMatch(db,bot=false,plan={offer:false,accept:true,offerDelayMs:4000,replyDelayMs:3000}){
 await db.exec('update lotus_ranked.settings set enabled=true');
 await enter(db,1);if(bot)await age(db,1);else await enter(db,2);
 const match=await rpc(db,'ranked_pair',['ap-south-1']);
 await rpc(db,'ranked_commit',[match,0,{ranked:{openingSeat:0},state:{phase:'finished',winners:[0],totals:[10,14]}},null,{}]);
 await rpc(db,'ranked_prepare_rematch',[match,plan]);return match;
}

test('mutual human rematch creates exactly one new game, rotates opening and snapshots current ratings',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db);
  const offered=await rpc(db,'ranked_rematch',[uid(1),match,'request']);assert.equal(offered.status,'offered');
  assert.equal((await rpc(db,'ranked_status',[uid(1)])).played,1);
  assert.equal((await rpc(db,'ranked_rematch',[uid(2),match,'status'])).fromSeat,1);
  const accepted=await rpc(db,'ranked_rematch',[uid(2),match,'accept']);assert.equal(accepted.status,'accepted');
  assert.equal((await rpc(db,'ranked_rematch',[uid(2),match,'accept'])).nextMatchId,accepted.nextMatchId);
  const next=await rpc(db,'ranked_load_match',[accepted.nextMatchId]);
  assert.equal(next.parent_match_id,match);assert.equal(next.opening_seat,1);assert.equal(next.series_index,2);
  assert.equal(next.participants[0].rating_before,635);
  assert.equal((await rpc(db,'ranked_status',[uid(1)])).played,1);
  const transport=async(name,args={})=>{
   const entries=Object.entries(args);
   return (await db.query(`select public.${name}(${entries.map(([key],i)=>`${key}=>$${i+1}`).join(',')}) as value`,entries.map(([,v])=>v))).rows[0].value;
  };
  const job=await rpc(db,'ranked_claim_job');
  assert.equal(await processRankedJob(transport,job),true);
  const opened=await rpc(db,'ranked_load_match',[next.id]);assert.equal(opened.data.state.active,1);assert.deepEqual(opened.data.memorySeen,[]);
  await handleRanked(transport,uid(1),{command:'leave',matchId:next.id,actionId:uid(999)});
  assert.equal((await rpc(db,'ranked_status',[uid(1)])).played,2);
  assert.equal((await rpc(db,'ranked_status',[uid(2)])).played,2);
 }finally{await db.close();}
});

test('bot rematch response is delayed and fixed, preserves rival identity and ability',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db,true);
  const original=await rpc(db,'ranked_load_match',[match]);
  const request=await rpc(db,'ranked_rematch',[uid(1),match,'request']);assert.equal(request.status,'offered');
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).nextMatchId,null);
  // A second prepare cannot reroll a stored decision.
  await rpc(db,'ranked_prepare_rematch',[match,{offer:false,accept:false,offerDelayMs:4000,replyDelayMs:2000}]);
  await db.query("update lotus_ranked.rematches set response_at=now()-interval '1 second' where match_id=$1",[match]);
  const accepted=await rpc(db,'ranked_rematch',[uid(1),match,'status']);assert.equal(accepted.status,'accepted');
  const next=await rpc(db,'ranked_load_match',[accepted.nextMatchId]);
  assert.equal(next.participants[1].bot_identity_id,original.participants[1].bot_identity_id);
  assert.deepEqual(next.participants[1].bot_config,original.participants[1].bot_config);
 }finally{await db.close();}
});

test('proactive bot offers, refusal, expiry and rematch preferences are respected',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db,true,{offer:true,accept:false,offerDelayMs:3000,replyDelayMs:2000});
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).status,'scheduled');
  await db.query("update lotus_ranked.rematches set offer_at=now()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).fromSeat,1);
  await rpc(db,'ranked_preferences',[uid(1),false]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).status,'declined');
  await assert.rejects(rpc(db,'ranked_rematch',[uid(2),match,'accept']),/not found/);
 }finally{await db.close();}
 const other=await database();try{
  const match=await finishedMatch(other,true,{offer:false,accept:false,offerDelayMs:3000,replyDelayMs:2000});
  await rpc(other,'ranked_rematch',[uid(1),match,'request']);
  await other.query("update lotus_ranked.rematches set response_at=now()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(other,'ranked_rematch',[uid(1),match,'status'])).status,'declined');
 }finally{await other.close();}
});

test('old rematch cannot steal a competitor from a fresh queue and expired offers cannot start games',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db);
  await rpc(db,'ranked_rematch',[uid(1),match,'request']);
  await enter(db,2);
  const r=await rpc(db,'ranked_rematch',[uid(2),match,'accept']);assert.equal(r.status,'declined');
  assert.equal(r.nextMatchId,null);
  assert.equal((await rpc(db,'ranked_status',[uid(2)])).ticket.status,'waiting');
 }finally{await db.close();}
 const expired=await database();try{
  const match=await finishedMatch(expired);
  await rpc(expired,'ranked_rematch',[uid(1),match,'request']);
  await expired.query("update lotus_ranked.rematches set expires_at=now()-interval '1 second' where match_id=$1",[match]);
  await assert.rejects(rpc(expired,'ranked_rematch',[uid(2),match,'accept']),/No incoming/);
 }finally{await expired.close();}
});

test('migration compiles, roster matches policy configuration, private RPCs reject clients', async () => {
  const db = await database();
  try {
    assert.ok(migration.replace(/\r\n/g, '\n').endsWith(rosterSql()));
    assert.deepEqual((await db.query('select id,name from lotus_ranked.bot_identities order by id')).rows,BOT_IDENTITIES.map(p=>({id:p.id,name:p.name})));
    assert.equal((await db.query('select count(*)::int as n from lotus_ranked.bot_identities')).rows[0].n,180);
    assert.equal((await db.query('select count(*)::int as n from lotus_ranked.bot_profiles')).rows[0].n,15);
    await db.exec('set role authenticated');
    await assert.rejects(rpc(db,'ranked_status',[uid(1)]),/permission denied/);
    await assert.rejects(db.query('select * from lotus_ranked.ratings'),/permission denied/);
    await db.exec('reset role; set role service_role');
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).enabled,false);
  } finally {await db.close();}
});

test('empty queue assigns a named bot after 750 ms, not before; name survives roster edits',async()=>{
  const db=await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1);await age(db,1,0.6);
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
    await age(db,1,0.8);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    const record=await rpc(db,'ranked_load_match',[match]);
    const rival=BOT_IDENTITIES.find(p=>p.id===record.participants[1].bot_identity_id);
    assert.ok(rival);
    assert.equal(record.participants[1].name,rival.name);
    assert.equal(record.participants[1].bot_config.seed,rival.seed);
    await db.query('update lotus_ranked.bot_identities set name=$1 where id=$2',['Changed Name',rival.id]);
    assert.equal((await rpc(db,'ranked_load_match',[match])).participants[1].name,rival.name);
  } finally {await db.close();}
});

test('a newly enqueued compatible human wins over eligible fast bot fallback immediately',async()=>{
  const db=await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1);await age(db,1,0.8);
    await rpc(db,'ranked_acknowledge',[uid(2),'ranked-ai-v1']);
    const status=await rpc(db,'ranked_enqueue',[uid(2),'ap-south-1']);
    assert.ok(status.activeMatchId);
    const record=await rpc(db,'ranked_load_match',[status.activeMatchId]);
    assert.deepEqual(record.participants.map(p=>p.kind),['human','human']);
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
  } finally {await db.close();}
});

test('busy or reduced cosmetic roster never forces a long wait when an enabled bot exists',async()=>{
  const db=await database();
  try {
    await db.exec("update lotus_ranked.settings set enabled=true; update lotus_ranked.bot_identities set enabled=false where id<>'rival-001'");
    await enter(db,1);await age(db,1,0.8);
    const first=await rpc(db,'ranked_pair',['ap-south-1']);
    await enter(db,2);await age(db,2,0.8);
    const second=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.ok(second);
    assert.equal((await rpc(db,'ranked_load_match',[second])).participants[1].bot_identity_id,'rival-001');
    await rpc(db,'ranked_abort',[first]);
    await enter(db,1);await age(db,1,0.8);
    const repeat=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.ok(repeat);
  } finally {await db.close();}
});

test('incompatible waiting humans get at most a 3 second search window',async()=>{
  const db=await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1);await enter(db,2);
    await db.query('update lotus_ranked.tickets set rating=2000 where user_id=$1',[uid(2)]);
    await age(db,1,0.8);await age(db,2,0.8);
    assert.equal(await rpc(db,'ranked_pair',['ap-south-1']),null);
    await age(db,1,3.1);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.equal((await rpc(db,'ranked_load_match',[match])).participants[1].kind,'bot');
  } finally {await db.close();}
});

test('public admission pairs 15 entrants into seven human matches with one fast fallback',async()=>{
  const db=await database();
  try {
    await db.exec('update lotus_ranked.settings set enabled=true');
    for(let n=1;n<=15;n++) {
      await rpc(db,'ranked_acknowledge',[uid(n),'ranked-ai-v1']);
      await rpc(db,'ranked_enqueue',[uid(n),'ap-south-1']);
    }
    assert.equal((await db.query("select count(*)::int as n from lotus_ranked.matches")).rows[0].n,7);
    await age(db,15,0.8);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    assert.equal((await rpc(db,'ranked_load_match',[match])).participants[1].kind,'bot');
  } finally {await db.close();}
});

test('shared leaderboard uses real results and varied, evolving rival ratings without auth IDs',async()=>{
  const db=await database();
  try {
    await assert.rejects(rpc(db,'ranked_leaderboard',[uid(1),50,0]),/acknowledge/);
    await db.exec('update lotus_ranked.settings set enabled=true');
    await enter(db,1);await age(db,1,0.8);
    const match=await rpc(db,'ranked_pair',['ap-south-1']);
    const record=await rpc(db,'ranked_load_match',[match]);
    const initial=await rpc(db,'ranked_leaderboard',[uid(1),100,0]);
    assert.equal(initial.total,180);
    assert.equal(new Set(initial.entries.map(p=>p.rating)).size,100);
    assert.ok(initial.entries.every(p=>p.kind==='bot'&&p.played===0&&p.wins===0));
    const before=Number((await db.query('select lotus_ranked.rival_rating($1,(select season from lotus_ranked.settings)) as rating',[record.participants[1].bot_identity_id])).rows[0].rating);
    await rpc(db,'ranked_commit',[match,0,{state:{phase:'finished',winners:[1],totals:[20,10]}},null,{}]);
    const pages=[await rpc(db,'ranked_leaderboard',[uid(1),100,0]),await rpc(db,'ranked_leaderboard',[uid(1),100,100])];
    const entries=pages.flatMap(p=>p.entries);
    const rival=entries.find(p=>p.entry_id===record.participants[1].bot_identity_id);
    assert.equal(rival.name,record.participants[1].name);
    assert.equal(rival.played,1);assert.equal(rival.wins,1);assert.ok(rival.rating>before);
    assert.ok(entries.every(p=>p.rating_type==='competitive'));
    assert.equal(entries.find(p=>p.kind==='human').played,1);
    assert.equal(pages[0].total,181);
    assert.equal(JSON.stringify(entries).includes(uid(1)),false);
    await assert.rejects(rpc(db,'ranked_leaderboard',[uid(1),101,0]),/Invalid/);
  } finally {await db.close();}
});

test('player leaderboard breaks ties consistently and paginates without duplicate positions',async()=>{
 const db=await database();try{
  await rpc(db,'ranked_acknowledge',[uid(1),'ranked-ai-v1']);
  await db.query(`insert into lotus_ranked.ratings(user_id,season,rating,played,wins)
   select id,(select season from lotus_ranked.settings),900,4,2 from auth.users
   on conflict(user_id,season) do update set rating=900,played=4,wins=2`);
  await db.query('update lotus_ranked.ratings set wins=3 where user_id=$1',[uid(2)]);
  await db.query('update lotus_ranked.ratings set played=0,wins=0 where user_id=$1',[uid(3)]);
  const first=await rpc(db,'ranked_leaderboard',[uid(1),100,0]);
  const next=await rpc(db,'ranked_leaderboard',[uid(1),100,100]);
  const all=[...first.entries,...next.entries];
  assert.equal(first.total,199);assert.equal(next.total,199);
  assert.deepEqual(all.map(x=>x.rank),Array.from({length:199},(_,i)=>i+1));
  assert.equal(new Set(all.map(x=>x.entry_id)).size,199);
  const humans=all.filter(x=>x.kind==='human');assert.equal(humans[0].wins,3);
  assert.ok(humans.every(x=>x.rating===900));
  assert.deepEqual(await rpc(db,'ranked_leaderboard',[uid(1),100,0]),first);
 }finally{await db.close();}
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
    assert.deepEqual(ratings,[{rating:635,played:1},{rating:591,played:1}]);
    assert.equal((await rpc(db,'ranked_status',[uid(1)])).activeMatchId,null);
    assert.equal(await rpc(db,'ranked_abort',[match]),false);
  } finally {await db.close();}
});

test('bot result uses normal progression; abort has no rating effect', async () => {
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
    assert.equal(seen.packet.state.players[1].name,(await rpc(db,'ranked_load_match',[match])).participants[1].name);
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


test('a request crossing a due AI offer still waits for server-side confirmation',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db,true,{offer:true,accept:true,offerDelayMs:3000,replyDelayMs:2500});
  await db.query("update lotus_ranked.rematches set offer_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  const reply=await rpc(db,'ranked_rematch',[uid(1),match,'request']);
  assert.equal(reply.status,'offered');assert.equal(reply.fromSeat,0);assert.equal(reply.nextMatchId,null);
  const deadline=(await db.query('select response_at,extract(epoch from(response_at-clock_timestamp())) seconds from lotus_ranked.rematches where match_id=$1',[match])).rows[0];
  assert.ok(Number(deadline.seconds)>2&&Number(deadline.seconds)<=2.5);
  await rpc(db,'ranked_rematch',[uid(1),match,'request']);
  assert.equal(String((await db.query('select response_at from lotus_ranked.rematches where match_id=$1',[match])).rows[0].response_at),String(deadline.response_at));
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).nextMatchId,null);
  await db.query("update lotus_ranked.rematches set response_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).status,'accepted');
 }finally{await db.close();}
});

test('accepting an AI offer waits, retries keep its deadline, and its existing offer remains willing',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db,true,{offer:true,accept:false,offerDelayMs:3000,replyDelayMs:3000});
  await db.query("update lotus_ranked.rematches set offer_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).fromSeat,1);
  const reply=await rpc(db,'ranked_rematch',[uid(1),match,'accept']);
  assert.equal(reply.status,'offered');assert.equal(reply.fromSeat,0);assert.equal(reply.nextMatchId,null);
  const before=(await db.query('select response_at from lotus_ranked.rematches where match_id=$1',[match])).rows[0].response_at;
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'accept'])).status,'offered');
  assert.equal(String((await db.query('select response_at from lotus_ranked.rematches where match_id=$1',[match])).rows[0].response_at),String(before));
  await db.query("update lotus_ranked.rematches set response_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  const accepted=await rpc(db,'ranked_rematch',[uid(1),match,'status']);assert.equal(accepted.status,'accepted');
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'accept'])).nextMatchId,accepted.nextMatchId);
  assert.equal((await db.query('select count(*)::int n from lotus_ranked.matches where parent_match_id=$1',[match])).rows[0].n,1);
 }finally{await db.close();}
});

test('cancelling an AI confirmation prevents a later poll from allocating a rematch',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db,true,{offer:true,accept:true,offerDelayMs:3000,replyDelayMs:3000});
  await db.query("update lotus_ranked.rematches set offer_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'accept'])).status,'offered');
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'cancel'])).status,'declined');
  await db.query("update lotus_ranked.rematches set response_at=clock_timestamp()-interval '1 second' where match_id=$1",[match]);
  assert.equal((await rpc(db,'ranked_rematch',[uid(1),match,'status'])).nextMatchId,null);
 }finally{await db.close();}
});

test('crossed human rematch requests still match immediately',async()=>{
 const db=await database();try{
  const match=await finishedMatch(db);
  await rpc(db,'ranked_rematch',[uid(1),match,'request']);
  assert.equal((await rpc(db,'ranked_rematch',[uid(2),match,'request'])).status,'accepted');
 }finally{await db.close();}
});
