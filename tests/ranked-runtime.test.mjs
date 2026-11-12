import test from 'node:test';
import assert from 'node:assert/strict';
import {BOT_PROFILES, botMatchConfig} from '../lib/ranked-config.mjs';
import {bootstrapRanked,advanceRanked,planRankedJob,chooseRankedBot,applyRankedHuman,rankedBotObservation} from '../lib/ranked-runtime.mjs';
import {aiView,chooseAction,assertState,createGame} from '../lib/engine.mjs';
import {rankedHumanPacket} from '../lib/ranked-room.mjs';

function record(profile=BOT_PROFILES[0],seed=42) {
  return {id:'match',version:0,status:'allocated',participants:[
    {id:'seat-a',seat:0,kind:'human',user_id:'user-a',name:'A'},
    {id:'seat-b',seat:1,kind:'bot',user_id:null,bot_config:botMatchConfig(profile,seed)},
  ]};
}

const card=(rank,suit='♣')=>({id:rank+suit,rank,suit});
function decision(cards=[null,null,card('2'),card('A')],held=card('3')) {
 return {active:1,phase:'decision',turn:0,caller:null,pending:null,held,source:'deck',discard:card('9'),canTakeDiscard:true,isTurn:true,
  players:[{penalty:0,eliminated:false,slots:cards.map(()=>({occupied:true,known:null}))},
   {penalty:0,eliminated:false,slots:cards.map(known=>({occupied:true,known}))}]};
}

test('fresh low opening cards are protected and blind replacements explore other slots',()=>{
 const chosen=new Set();
 for(const profile of BOT_PROFILES)for(let seed=0;seed<100;seed++) {
  const view=decision(),before=structuredClone(view);
  const result=chooseRankedBot(view,{...profile,seed},'first');
  assert.equal(result.action.type,'replace');assert.ok([0,1].includes(result.action.i));chosen.add(result.action.i);
  assert.deepEqual(view,before);
 }
 assert.equal(chosen.size,2);
});

test('known 2s are never traded for a 3, while a known 3 can improve to a 2',()=>{
 for(const profile of BOT_PROFILES)for(let seed=0;seed<60;seed++) {
  const cfg={...profile,seed};
  assert.equal(chooseRankedBot(decision([card('2'),card('2','♥'),card('A'),card('K','♦')]),cfg,'worse').action.type,'discard');
  assert.deepEqual(chooseRankedBot(decision([card('3'),card('2','♥'),card('A'),card('K','♦')],card('2')),cfg,'better').action,{type:'replace',i:0});
 }
});

test('missing a match does not erase a low card for the following replacement',()=>{
 const cfg={...BOT_PROFILES[0],seed:6,reactionChance:0};
 const v=decision();v.phase='ready';v.held=null;v.discard=card('2');
 assert.equal(chooseRankedBot(v,cfg,'missed').action.type,'take');
 v.phase='decision';v.held=v.discard;v.source='discard';
 assert.ok([0,1].includes(chooseRankedBot(v,cfg,'replace').action.i));
});

test('Queen keeps a fresh low card instead of swapping for a worse or equal card',()=>{
 const v=decision([card('A'),card('2'),card('3'),card('4')]);
 v.phase='swapConfirm';v.pending={target:0,i:0};v.players[0].slots[0].known=card('9');
 assert.equal(chooseRankedBot(v,BOT_PROFILES[0],'inspect').action.type,'skip');
 v.players[0].slots[0].known=card('K','♥');
 assert.equal(chooseRankedBot(v,BOT_PROFILES[0],'inspect').action.type,'swap');
 v.players[0].slots[0].known=card('A','♥');v.caller=0;
 assert.equal(chooseRankedBot(v,BOT_PROFILES[0],'inspect').action.type,'skip');
});

test('forgetting starts after several personal turns and never rerolls on polling',()=>{
 let forgotten=0;
 for(let seed=0;seed<50;seed++) {
  const room={state:createGame({players:2,seed:42,difficulty:'hard'}).state,ranked:{botTurns:{1:0}}};
  const bot={seat:1,bot_config:{...BOT_PROFILES[0],seed,recall:0}};
  const initial=rankedBotObservation(room,bot);
  for(let turn=1;turn<3;turn++) {
   room.ranked.botTurns[1]=turn;
   assert.deepEqual(rankedBotObservation(room,bot).players[1].slots,initial.players[1].slots);
  }
  for(let turn=3;turn<20;turn++) {
   room.ranked.botTurns[1]=turn;
   const view=rankedBotObservation(room,bot),memory=structuredClone(room.ranked.botMemory);
   assert.deepEqual(rankedBotObservation(room,bot),view);
   assert.deepEqual(room.ranked.botMemory,memory);
  }
  forgotten+=rankedBotObservation(room,bot).players[1].slots.filter(s=>s.occupied&&!s.known).length-2;
  assertState(room.state); // Filtering never alters the trusted engine knowledge.
 }
 assert.ok(forgotten>50);
});

test('a power peek refreshes forgotten memory and counts only the completed bot turn',()=>{
 const r=record();r.data=bootstrapRanked(r,0).room;
 const s=createGame({players:2,seed:42,difficulty:'hard'}).state;
 const index=s.deck.findIndex(c=>c.rank==='J'&&c.suit==='♥');
 s.held=s.deck.splice(index,1)[0];s.phase='peek';s.active=1;s.source='deck';
 r.data.state=s;r.data.deadline=25000;r.data.presentationUntil=null;
 rankedBotObservation(r.data,r.participants[1]);
 r.data.ranked.botTurns={1:8};
 r.data.ranked.botMemory[1][1][2].forgotten=true;
 const result=advanceRanked(r,{expected_version:r.version,payload:{type:'bot',seat:1,action:{type:'peek',i:2}}},1000);
 assert.equal(result.room.ranked.botTurns[1],9);
 const view=rankedBotObservation(result.room,r.participants[1]);
 assert.equal(view.players[1].slots[2].known.id,s.players[1].slots[2].id);
 assert.equal(result.room.ranked.botMemory[1][1][2].learnedAt,9);
 assertState(result.room.state);
});

test('a locked matching card remains known for value decisions and private memory is never sent to players',()=>{
 const v=decision([card('2'),card('2','♥'),card('A'),card('K','♦')]);
 v.phase='ready';v.held=null;v.discard=card('2','♠');v.locked={card:'2♣',against:'2♠'};
 const cfg={...BOT_PROFILES[0],reactionChance:1};
 assert.equal(chooseRankedBot(v,cfg,'lock').action.i,1); // Can match the other 2.
 v.players[1].slots[1].known=card('A','♥');
 assert.equal(chooseRankedBot(v,cfg,'lock').action.type,'draw');
 const r=record();r.data=bootstrapRanked(r,0).room;
 assert.ok(r.data.ranked.botMemory);
 const packet=rankedHumanPacket(r,r.participants,'user-a');
 assert.equal(JSON.stringify(packet).includes('botMemory'),false);
 assert.equal(JSON.stringify(packet).includes('learnedAt'),false);
 assert.equal(packet.state.players[1].slots[2].rank,undefined);
});

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
