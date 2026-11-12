import test from 'node:test';
import assert from 'node:assert/strict';
import {BOT_PROFILES,botMatchConfig} from '../lib/ranked-config.mjs';
import {rivalDelay,rematchPersonality,queueRivalSocial,appendSocial} from '../lib/rival-personality.mjs';
import {restoreSettings} from '../lib/table-settings.mjs';
import {TableAudio} from '../lib/audio.mjs';

test('personality timing is stable, phase-aware, varied and below turn deadlines',()=>{
  const timings=new Set();
  for(const profile of BOT_PROFILES){
    const cfg=botMatchConfig(profile,42);
    for(let n=0;n<50;n++){
      const key=String(n);
      const memory=rivalDelay(cfg,'memory',null,key);
      assert.ok(memory>=3800&&memory<=9000);
      const swap=rivalDelay(cfg,'swap',{type:'inspect'},key);
      assert.ok(swap>=1800&&swap<7000);
      assert.equal(swap,rivalDelay(cfg,'swap',{type:'inspect'},key));
      const routine=rivalDelay(cfg,'ready',{type:'draw'},key);
      assert.ok(routine>=1100&&routine<4000);timings.add(routine);
    }
  }
  assert.ok(timings.size>100);
});

test('rematch personalities both accept and decline and do not reroll decisions',()=>{
  const outcomes=new Set();
  for(let seed=1;seed<100;seed++){
    const record={id:`match-${seed}`,series_index:1,participants:[{kind:'human',seat:0},{kind:'bot',seat:1,bot_config:botMatchConfig(BOT_PROFILES[seed%15],seed)}],data:{state:{winners:[0],totals:[10,14]}}};
    const p=rematchPersonality(record);assert.deepEqual(p,rematchPersonality(record));
    assert.ok(p.replyDelayMs>=2000&&p.replyDelayMs<=5000);
    assert.ok(p.offerDelayMs>=3000&&p.offerDelayMs<=6000);outcomes.add(p.accept);
  }
  assert.deepEqual(outcomes,new Set([true,false]));
});

test('social feed is bounded and rival reactions obey count and cooldown limits',()=>{
  const room={ranked:{socialCount:4},state:{phase:'ready',turn:4}};
  queueRivalSocial(room,[{kind:'bot',seat:1,bot_config:botMatchConfig(BOT_PROFILES[0],42)}],[{type:'match',p:1,ok:false}],50000);
  assert.equal(room.ranked.pendingSocial,undefined);
  for(let n=0;n<30;n++)appendSocial(room,{type:'message',p:1,text:'Nice move!'},n);
  assert.equal(room.ranked.socialFeed.length,20);assert.equal(room.ranked.socialFeed[0].id,11);
});

test('old and malformed settings restore safely while new preferences persist',()=>{
  const s=restoreSettings({sound:false,players:3,muteEmotes:true,allowRematches:false});
  assert.equal(s.sound,false);assert.equal(s.haptics,true);assert.equal(s.muteEmotes,true);assert.equal(s.allowRematches,false);
  const bad=restoreSettings({players:100,sound:'false',difficulty:'god',motion:null});
  assert.equal(bad.players,4);assert.equal(bad.sound,true);assert.equal(bad.difficulty,'medium');
});

test('muted sound does not disable haptics; unsupported vibration is harmless',()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  let calls=0;
  try{
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{vibrate:()=>{calls++;}}});
    const audio=new TableAudio();audio.enabled=false;audio.play('success');assert.equal(calls,1);
    audio.haptics=false;audio.play('success');assert.equal(calls,1);
    Object.defineProperty(globalThis,'navigator',{configurable:true,value:{}});audio.haptics=true;audio.play('success');
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});
