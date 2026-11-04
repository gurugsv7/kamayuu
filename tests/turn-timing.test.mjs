import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,applyIntent,playerPacket} from '../lib/multiplayer-rules.mjs';
import {turnClock} from '../lib/turn-timing.mjs';
function room(){let r=newRoom('a','A',0);r=applyIntent(r,'b',{command:'join',name:'B'},0).room;for(const u of ['a','b'])r=applyIntent(r,u,{command:'ready',ready:true},0).room;r=applyIntent(r,'a',{command:'start'},0).room;for(const u of ['a','b'])r=applyIntent(r,u,{command:'remember'},1000).room;return r;}
function top(r,rank,suit='♠'){const piles=[r.state.deck,r.state.discard,...r.state.players.map(p=>p.slots)];const row=piles.find(a=>a.some(c=>c?.rank===rank&&c.suit===suit));const i=row.findIndex(c=>c?.rank===rank&&c.suit===suit);[row[i],r.state.deck[r.state.deck.length-1]]=[r.state.deck.at(-1),row[i]];r.state.knowledge=r.state.knowledge.map(()=>r.state.players.map(()=>[null,null,null,null]));}
test('draw gets 7 seconds; ordinary deck and discard plays get a fresh 25 seconds',()=>{
 for(const type of ['draw','take']){let r=room();assert.equal(r.deadline,8000);assert.equal(r.clockDurationMs,7000);top(r,'4');if(type==='take')r.state.discard.at(-1).id='available-discard';r=applyIntent(r,'a',{command:'action',action:{type}},6000).room;assert.equal(r.deadline,31000);assert.equal(r.clockDurationMs,25000);r=applyIntent(r,'a',{command:'action',action:{type:'replace',i:0}},20000).room;assert.equal(r.clockDurationMs,7000);assert.equal(r.deadline,27000);}
});
test('Queen inspection shares one 25-second budget; holds and messages never refill it',()=>{
 let r=room();top(r,'Q','♥');r=applyIntent(r,'a',{command:'action',action:{type:'draw'}},2000).room;assert.equal(r.state.phase,'swap');assert.equal(r.deadline,27000);
 r=applyIntent(r,'a',{command:'hold'},3000).room;r=applyIntent(r,'a',{command:'message',text:'Nice move!'},4000).room;assert.equal(r.deadline,27000);
 r=applyIntent(r,'a',{command:'action',action:{type:'inspect',target:1,i:0}},10000).room;assert.equal(r.state.phase,'swapConfirm');assert.equal(r.deadline,27000);
 r=applyIntent(r,'a',{command:'action',action:{type:'skip'}},23000).room;assert.equal(r.state.phase,'ready');assert.equal(r.deadline,30000);
});
test('Jack power gets 25 seconds and packet exposes fixed clock duration',()=>{let r=room();top(r,'J','♦');r=applyIntent(r,'a',{command:'action',action:{type:'draw'}},7000).room;assert.equal(r.state.phase,'peek');assert.equal(r.deadline,32000);const p=playerPacket({id:'x',version:1,data:r},'a');assert.equal(p.room.clockDurationMs,25000);assert.equal(p.room.clockStartedAt,7000);assert.equal(p.room.clockPhase,'peek');});
test('ring retains full phase duration across delayed and repeated recovery packets',()=>{
 const r={deadline:17000,serverTime:12000,receivedAt:50000,clockDurationMs:7000};
 assert.deepEqual(turnClock(r,'ready',50000),{seconds:5,progress:5/7});
 assert.deepEqual(turnClock({...r,serverTime:13000,receivedAt:51000},'ready',51000),{seconds:4,progress:4/7});
 assert.deepEqual(turnClock(r,'ready',52000),{seconds:3,progress:3/7});
});
test('ring uses ceil seconds and continuous fraction, not rounded seconds or animation time',()=>{const r={deadline:17000,serverTime:10000,receivedAt:100};assert.equal(turnClock(r,'ready',101).seconds,7);assert.equal(turnClock(r,'ready',101).progress,6999/7000);assert.equal(turnClock(r,'ready',7100).seconds,0);assert.equal(turnClock(r,'ready',8100).progress,0);assert.equal(turnClock({...r,deadline:35000},'swapConfirm',100).progress,1);});
