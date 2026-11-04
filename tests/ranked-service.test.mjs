import test from 'node:test';
import assert from 'node:assert/strict';
import {handleRanked} from '../lib/ranked-service.mjs';
import {readFileSync} from 'node:fs';

test('entry service derives identity from verified auth and never accepts client rating',async()=>{
  const calls=[];
  const rpc=async(name,args)=>{calls.push({name,args});return {enabled:false};};
  await handleRanked(rpc,'actual-user',{command:'enqueue',userId:'forged',rating:4000,region:'ap-south-1'});
  assert.deepEqual(calls,[{name:'ranked_enqueue',args:{p_user:'actual-user',p_region:'ap-south-1'}}]);
  await assert.rejects(handleRanked(rpc,null,{command:'status'}),/Sign in/);
  await assert.rejects(handleRanked(rpc,'actual-user',{command:'pair'}),/Unsupported/);
});

test('first-entry acknowledgment is explicit and versioned',async()=>{
  const calls=[];
  await handleRanked(async(name,args)=>{calls.push({name,args});return {};},'user',{command:'acknowledge',version:'ranked-ai-v1'});
  assert.equal(calls[0].name,'ranked_acknowledge');
  assert.deepEqual(calls[0].args,{p_user:'user',p_version:'ranked-ai-v1'});
});

test('leaderboard uses authenticated identity and bounded page size',async()=>{
  const calls=[];
  await handleRanked(async(name,args)=>{calls.push({name,args});return {};},'actual-user',
    {command:'leaderboard',userId:'forged',limit:10000,offset:50});
  assert.deepEqual(calls,[{name:'ranked_leaderboard',args:{p_user:'actual-user',p_limit:50,p_offset:50}}]);
});

test('nonmembers cannot recover private state or worker jobs',async()=>{
  const rpc=async()=>({participants:[{kind:'human',user_id:'other'}],data:{secret:'hidden'}});
  await assert.rejects(handleRanked(rpc,'user',{command:'recover',matchId:'match'}),/not found/);
});

test('deployed module copies match the tested source',()=>{
  for(const file of ['engine.mjs','multiplayer-rules.mjs','ranked-config.mjs','ranked-room.mjs','ranked-runtime.mjs','ranked-service.mjs','rival-personality.mjs']) {
    assert.equal(readFileSync(new URL(`../lib/${file}`,import.meta.url),'utf8'),readFileSync(new URL(`../supabase/functions/lotus-ranked/${file}`,import.meta.url),'utf8'));
  }
});
