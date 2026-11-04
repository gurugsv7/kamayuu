import test from 'node:test';
import assert from 'node:assert/strict';
import {BOT_PROFILES, botMatchConfig} from '../lib/ranked-config.mjs';
import {bootstrapRanked,advanceRanked,planRankedJob,chooseRankedBot,applyRankedHuman} from '../lib/ranked-runtime.mjs';
import {aiView,chooseAction,assertState} from '../lib/engine.mjs';

function record(profile=BOT_PROFILES[0],seed=42) {
  return {id:'match',version:0,status:'allocated',participants:[
    {id:'seat-a',seat:0,kind:'human',user_id:'user-a',name:'A'},
    {id:'seat-b',seat:1,kind:'bot',user_id:null,bot_config:botMatchConfig(profile,seed)},
  ]};
}

test('all 15 fixed profiles finish mixed matches through scheduled jobs and normal human intents',()=>{
  for(const profile of BOT_PROFILES) for(let seed=1;seed<=8;seed++) {
    const r=record(profile,seed);let now=1000,result=bootstrapRanked(r,now);r.data=result.room;r.version++;
    const config=JSON.stringify(r.participants[1].bot_config);
    for(let guard=0;guard<1500 && r.data.state.phase!=='finished';guard++) {
      const s=r.data.state;
      if(s.phase==='memory' && !r.data.memorySeen.includes('seat-a')) {
        result=applyRankedHuman(r,'user-a',{command:'remember'},now);
      } else if(s.active===0 && !['memory','lastCall'].includes(s.phase)) {
        const action=chooseAction(aiView(s,0),()=>0.5);
        result=applyRankedHuman(r,'user-a',{command:'action',action},now);
      } else {
        const planned=planRankedJob(r.data,r.participants,now);
        now=planned.due;
        result=advanceRanked(r,{expected_version:r.version,payload:planned.payload},now);
      }
      r.data=result.room;r.version++;assertState(r.data.state);
      assert.equal(JSON.stringify(r.participants[1].bot_config),config);
    }
    assert.equal(r.data.state.phase,'finished',profile.id+':'+seed);
  }
});

test('bot policy cannot distinguish states with identical legal observations',()=>{
  const r=record();r.data=bootstrapRanked(r,0).room;
  r.data.state.phase='ready';
  const before={...aiView(r.data.state,1),isTurn:true};
  const s=structuredClone(r.data.state);
  [s.players[0].slots[0],s.players[0].slots[1]]=[s.players[0].slots[1],s.players[0].slots[0]];
  s.deck.reverse();
  const after={...aiView(s,1),isTurn:true};
  assert.deepEqual(before,after);
  assert.deepEqual(chooseRankedBot(before,r.participants[1].bot_config,'same'),chooseRankedBot(after,r.participants[1].bot_config,'same'));
});

test('repeated human hold cannot extend a claimed turn and preserves pending bot delay',()=>{
  const r=record();r.data=bootstrapRanked(r,0).room;
  r.data.memorySeen=['seat-b'];
  r.data=applyRankedHuman(r,'user-a',{command:'remember'},1).room;
  r.data.state.active=0;
  r.data=applyRankedHuman(r,'user-a',{command:'hold'},2).room;
  const deadline=r.data.deadline;
  const next=applyRankedHuman(r,'user-a',{command:'hold'},10000);
  assert.equal(next.room.deadline,deadline);
  r.data.state.active=1;
  const first=planRankedJob(r.data,r.participants,3);
  assert.deepEqual(planRankedJob(r.data,r.participants,100,first),first);
});

test('inactive human cannot reset another player claim; leaving during memory forfeits safely',()=>{
  const r=record();
  const opening=bootstrapRanked(r,0).room;
  r.data=opening;
  assert.equal(applyRankedHuman(r,'user-a',{command:'leave'},1).room.state.phase,'finished');
  r.participants[1]={id:'seat-b',seat:1,kind:'human',user_id:'user-b'};
  r.data=bootstrapRanked(r,0).room;
  r.data=applyRankedHuman(r,'user-a',{command:'remember'},1).room;
  r.data=applyRankedHuman(r,'user-b',{command:'remember'},1).room;
  r.data.state.active=0;
  r.data=applyRankedHuman(r,'user-a',{command:'hold'},2).room;
  const deadline=r.data.deadline;
  r.data=applyRankedHuman(r,'user-b',{command:'hold'},3).room;
  r.data=applyRankedHuman(r,'user-a',{command:'hold'},1000).room;
  assert.equal(r.data.deadline,deadline);
});

test('emotes preserve the bot decision timer, obey cooldowns, and cannot smuggle arbitrary chat',()=>{
 const r=record();r.data=bootstrapRanked(r,0).room;r.data.state.phase='ready';r.data.state.active=1;r.data.deadline=20000;
 const before=planRankedJob(r.data,r.participants,0);
 const changed=applyRankedHuman(r,'user-a',{command:'emote',name:'cool'},1000,before);
 assert.equal(changed.room.deadline,20000);assert.equal(changed.next.due,before.due);
 assert.equal(changed.room.ranked.socialFeed[0].name,'cool');
 r.data=changed.room;
 assert.throws(()=>applyRankedHuman(r,'user-a',{command:'emote',name:'angry'},1500),/Wait/);
 assert.throws(()=>applyRankedHuman(r,'user-a',{command:'message',text:'arbitrary chat'},5000),/Unknown/);
});
