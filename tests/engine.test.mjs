import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,transition,assertState,aiView,chooseAction,chooseReaction,value,isPower} from '../lib/engine.mjs';
function ready(n=4,seed=52){let s=createGame({players:n,seed}).state;return transition(s,{type:'remember'}).state;}
// Rig by exchanging IDs, preserving all 52 physical cards and clearing pre-fixture observations.
function locate(s,id){for(let p=0;p<s.players.length;p++){let i=s.players[p].slots.findIndex(c=>c?.id===id);if(i>=0)return [s.players[p].slots,i];}for(const a of [s.deck,s.discard]){let i=a.findIndex(c=>c?.id===id);if(i>=0)return [a,i];}throw Error(id);}
function put(s,id,array,i){const [a,j]=locate(s,id);[a[j],array[i]]=[array[i],a[j]];s.knowledge=s.knowledge.map(()=>s.players.map(()=>[null,null,null,null]));}
const step=(s,a)=>transition(s,a).state;
test('King tracking: risky replacement → public acquisition → hidden Queen recovery',()=>{let s=ready();s.difficulty='hard';put(s,'K♥',s.players[0].slots,1);put(s,'3♠',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const replace=transition(s,{type:'replace',i:1});assert.equal(replace.events[0].old.id,'K♥');s=replace.state;assert.equal(s.discard.at(-1).id,'K♥');s=step(s,{type:'take'});s=step(s,{type:'replace',i:2});assert.equal(s.players[1].slots[2].id,'K♥');for(const m of s.knowledge)assert.equal(m[1][2].id,'K♥');for(let n=0;n<2;n++){s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});}put(s,'Q♦',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const old=s.players[0].slots[2].id;const result=transition(transition(s,{type:'inspect',target:1,i:2}).state,{type:'swap'});s=result.state;assert.equal(result.events[0].type,'swap');assert.equal(s.players[0].slots[2].id,'K♥');assert.equal(s.players[1].slots[2].id,old);assertState(s);});
test('Match throw leaves exact empty slot and all other IDs untouched',()=>{let s=ready();put(s,'5♥',s.players[0].slots,3);put(s,'5♦',s.discard,s.discard.length-1);const ids=s.players[0].slots.map(c=>c.id);const result=transition(s,{type:'match',i:3});s=result.state;assert.equal(result.events[0].ok,true);assert.deepEqual(s.players[0].slots.map(c=>c?.id??null),[...ids.slice(0,3),null]);assert.equal(s.players[0].slots.filter(Boolean).length,3);assert.equal(s.active,0);assert.equal(s.turn,0);});
test('Wrong match returns original, takes actual discard into fifth then sixth slot',()=>{let s=ready();put(s,'5♥',s.players[0].slots,3);put(s,'6♦',s.discard,s.discard.length-1);let r=transition(s,{type:'match',player:0,i:3});s=r.state;assert.equal(s.players[0].slots[3].id,'5♥');assert.equal(s.players[0].slots[4].id,'6♦');assert.equal(s.players[0].penalty,0);assert.equal(s.discard.length,0);assert.equal(r.events[0].penaltyIndex,4);for(const m of s.knowledge)assert.equal(m[0][4].id,'6♦');
 // The miss came on your own turn, so the turn is spent along with the penalty.
 assert.equal(r.events[0].turnLost,true);assert.equal(s.active,1);assert.equal(s.turn,1);
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});if(s.discard.at(-1).rank==='5'){put(s,'8♣',s.discard,s.discard.length-1);}s=step(s,{type:'match',player:0,i:3});assert.equal(s.players[0].slots.length,6);assert.equal(s.active,2);assert.equal(s.turn,2);assertState(s);});
test('A miss out of turn leaves the running turn alone',()=>{let s=ready();s.active=2;put(s,'5♥',s.players[0].slots,3);put(s,'6♦',s.discard,s.discard.length-1);const r=transition(s,{type:'match',player:0,i:3});assert.equal(r.events[0].turnLost,undefined);assert.equal(r.state.active,2);assert.equal(r.state.turn,0);assert.equal(r.state.phase,'ready');});
test('A held draw blocks a throw until the turn is finished',()=>{let s=ready();put(s,'5♥',s.players[0].slots,3);put(s,'5♦',s.discard,s.discard.length-1);put(s,'4♠',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const copy=JSON.stringify(s);assert.throws(()=>step(s,{type:'match',player:0,i:3}),/Finish your draw/);assert.equal(JSON.stringify(s),copy);assert.equal(chooseReaction(aiView(s,0)),null);
 s=step(s,{type:'discard'});assert.equal(s.active,1);});
test('Jack peek is private, exact-position, and deck-only',()=>{let s=ready();put(s,'J♥',s.deck,s.deck.length-1);const id=s.players[0].slots[0].id;s=step(s,{type:'draw'});assert.equal(s.phase,'peek');s=step(s,{type:'peek',i:0});assert.equal(s.players[0].slots[0].id,id);assert.equal(s.knowledge[0][0][0].id,id);assert.equal(s.knowledge[1][0][0],null);s=step(s,{type:'take'});assert.equal(s.phase,'decision');s=step(s,{type:'replace',i:0});assert.equal(s.phase,'ready');});
test('Queen swaps same positions only, logical IDs and all observers track',()=>{let s=ready();s.difficulty='hard';put(s,'Q♥',s.deck,s.deck.length-1);s.knowledge[2][0][1]=s.players[0].slots[1];s=step(s,{type:'draw'});const ids=s.players.map(p=>p.slots.map(c=>c.id));assert.throws(()=>step(s,{type:'inspect',target:0,i:1}));assert.throws(()=>step(s,{type:'inspect',target:4,i:1}));s=step(s,{type:'inspect',target:2,i:1});assert.equal(s.phase,'swapConfirm');assert.deepEqual(s.pending,{target:2,i:1});s=step(s,{type:'swap'});assert.equal(s.pending,null);assert.equal(s.players[0].slots[1].id,ids[2][1]);assert.equal(s.players[2].slots[1].id,ids[0][1]);assert.equal(s.knowledge[2][2][1].id,ids[0][1]);for(let p=0;p<4;p++)for(let i=0;i<4;i++)if(i!==1||![0,2].includes(p))assert.equal(s.players[p].slots[i].id,ids[p][i]);});
test('Buzzer keeps the caller’s own turn, then one each; final Queen can target caller',()=>{let s=ready();s=step(s,{type:'buzz'});
 // The buzz costs nothing: the caller still plays the turn they pressed it on.
 assert.deepEqual(s.remaining,[0,1,2,3]);assert.equal(s.active,0);assert.equal(s.phase,'ready');
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});
 assert.deepEqual(s.remaining,[1,2,3]);assert.equal(s.active,1);
 put(s,'Q♦',s.deck,s.deck.length-1);const id=s.players[1].slots[1].id;s=step(s,{type:'draw'});s=step(s,{type:'inspect',target:0,i:1});s=step(s,{type:'swap'});assert.equal(s.players[0].slots[1].id,id);assert.deepEqual(s.remaining,[2,3]);for(let p=2;p<4;p++){assert.equal(s.active,p);s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});}assert.equal(s.phase,'lastCall');s=step(s,{type:'finish'});assert.equal(s.phase,'finished');assert.deepEqual(s.remaining,[]);assert.deepEqual(s.totals,s.players.map(p=>p.penalty+p.slots.reduce((n,c)=>n+value(c),0)));assert.throws(()=>step(s,{type:'draw'}));});
test('Red King values and source-specific powers',()=>{assert.equal(value({rank:'K',suit:'♥'}),0);assert.equal(value({rank:'K',suit:'♦'}),0);assert.equal(value({rank:'K',suit:'♠'}),13);assert.equal(isPower({rank:'Q',suit:'♠'}),null);assert.equal(isPower({rank:'J',suit:'♠'}),null);assert.equal(isPower({rank:'J',suit:'♣'}),null);assert.equal(isPower({rank:'J',suit:'♥'}),'peek');assert.equal(isPower({rank:'J',suit:'♦'}),'peek');assert.equal(isPower({rank:'Q',suit:'♦'}),'swap');});
test('AI view excludes hidden truth and deck order',()=>{let s=ready();const v=aiView(s,1);assert.equal('deck' in v,false);assert.equal('seed' in v,false);assert.equal(v.players[0].slots[0].known,null);assert.equal(v.players[1].slots[0].known,null);assert.ok(v.players[1].slots[2].known);const a=chooseAction(v,()=>.5);const old=s.players[0].slots[0];s.players[0].slots[0]=s.players[0].slots[1];s.players[0].slots[1]=old;assert.deepEqual(aiView(s,1),v);assert.deepEqual(chooseAction(aiView(s,1),()=>.5),a);});
test('Invalid input never changes source state; double draws reject',()=>{let s=ready();const snapshot=JSON.stringify(s);assert.throws(()=>step(s,{type:'replace',i:0}));assert.equal(JSON.stringify(s),snapshot);s=step(s,{type:'draw'});assert.throws(()=>step(s,{type:'draw'}));assert.throws(()=>step(s,{type:'buzz'}));});
test('300 complete seeded matches, all player counts and difficulties',()=>{for(let n=0;n<300;n++){let s=createGame({players:2+n%3,difficulty:['easy','medium','hard'][Math.floor(n/3)%3],seed:n+1}).state;s=step(s,{type:'remember'});let actions=0;while(s.phase!=='finished'&&actions++<800){s=step(s,chooseAction(aiView(s),()=>.5));assertState(s);}assert.equal(s.phase,'finished',`seed ${n+1}`);assert.ok(s.winners.length);}});


test('Reaction match preserves opponent draw, phase, turn and final-turn queue',()=>{let s=ready();s.active=2;put(s,'5♥',s.players[0].slots,2);put(s,'5♦',s.discard,s.discard.length-1);put(s,'4♠',s.deck,s.deck.length-1);s=step(s,{type:'draw'});s.caller=1;s.remaining=[2,3,0];const held=s.held.id;s=step(s,{type:'match',player:0,i:2});assert.equal(s.active,2);assert.equal(s.phase,'decision');assert.equal(s.held.id,held);assert.equal(s.turn,0);assert.deepEqual(s.remaining,[2,3,0]);});
test('Stale queued match is rejected without spending or penalizing',()=>{let s=ready();const original=JSON.stringify(s);assert.throws(()=>step(s,{type:'match',player:0,i:0,expectedDiscard:'invalid'}));assert.throws(()=>step(s,{type:'match',player:0,i:0,expectedCard:'invalid'}));assert.equal(JSON.stringify(s),original);});
test('Queen privately teaches both identities to its actor only',()=>{let s=ready();s.difficulty='hard';s.active=1;put(s,'Q♥',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const outgoing=s.players[1].slots[0],incoming=s.players[0].slots[0];const look=transition(s,{type:'inspect',target:0,i:0});assert.equal(look.events[0].type,'inspect');assert.equal(look.events[0].mine.id,outgoing.id);assert.equal(look.events[0].theirs.id,incoming.id);assert.equal(look.state.knowledge[1][1][0].id,outgoing.id);assert.equal(look.state.knowledge[1][0][0].id,incoming.id);assert.equal(look.state.knowledge[2][0][0],null);
 const r=transition(look.state,{type:'swap'});s=r.state;assert.equal(r.events[0].incoming.id,incoming.id);assert.equal(r.events[0].outgoing.id,outgoing.id);assert.equal(s.knowledge[1][1][0].id,incoming.id);assert.equal(s.knowledge[1][0][0].id,outgoing.id);assert.equal(s.knowledge[0][0][0],null);assert.equal(s.knowledge[2][1][0],null);});
test('Penalty card can be matched out; original four slots stay unchanged',()=>{let s=ready();put(s,'6♦',s.discard,s.discard.length-1);put(s,'5♥',s.players[0].slots,3);s=step(s,{type:'match',player:0,i:3});s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});put(s,'6♣',s.discard,s.discard.length-1);const ids=s.players[0].slots.slice(0,4).map(c=>c.id);s=step(s,{type:'match',player:0,i:4});assert.equal(s.players[0].slots[4],null);assert.deepEqual(s.players[0].slots.slice(0,4).map(c=>c.id),ids);});
test('Out-of-turn empty hand starts final rotation without interrupting held card',()=>{let s=ready();for(let i=0;i<3;i++){s.discard.push(s.players[0].slots[i]);s.players[0].slots[i]=null;}s.knowledge=s.knowledge.map(()=>s.players.map(()=>[null,null,null,null]));put(s,'5♥',s.players[0].slots,3);put(s,'5♦',s.discard,s.discard.length-1);s.active=1;put(s,'4♠',s.deck,s.deck.length-1);s=step(s,{type:'draw'});s=step(s,{type:'match',player:0,i:3});assert.equal(s.caller,0);assert.deepEqual(s.remaining,[1,2,3]);assert.equal(s.active,1);assert.equal(s.phase,'decision');assert.equal(s.held.id,'4♠');s=step(s,{type:'discard'});assert.deepEqual(s.remaining,[2,3]);});

test('Cannot reclaim your own match discard on the following turn, including a zero King',()=>{let s=ready();s.active=3;put(s,'K♥',s.players[0].slots,2);put(s,'K♠',s.discard,s.discard.length-1);s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});put(s,'K♠',s.discard,s.discard.length-1);s=step(s,{type:'match',player:0,i:2});assert.equal(s.active,0);assert.equal(s.discard.at(-1).id,'K♥');const copy=JSON.stringify(s);assert.throws(()=>step(s,{type:'take'}));assert.equal(JSON.stringify(s),copy);assert.equal(aiView(s).canTakeDiscard,false);assert.notEqual(chooseAction(aiView(s),()=>.5).type,'take');s=step(s,{type:'draw'});assert.ok(s.held);});
test('Another player may take a discarded card; replacement and ordinary discard record ownership',()=>{let s=ready();put(s,'3♥',s.deck,s.deck.length-1);s=step(s,{type:'draw'});s=step(s,{type:'discard'});assert.equal(s.discardOwners['3♥'],0);assert.equal(aiView(s).canTakeDiscard,true);s=step(s,{type:'take'});const old=s.players[1].slots[0].id;s=step(s,{type:'replace',i:0});assert.equal(s.discardOwners[old],1);assert.equal(s.players[1].slots[0].id,'3♥');});

test('Empty discard cannot match unknown cards or trigger AI reactions',()=>{let s=ready();s=step(s,{type:'take'});for(let p=0;p<4;p++)assert.equal(chooseReaction(aiView(s,p)),null);let v=aiView(s);v.phase='ready';v.turn=0;assert.equal(chooseAction(v,()=>.5).type,'draw');});
test('300 complete matches with reactions from every opponent between actions',()=>{for(let n=0;n<300;n++){let s=step(createGame({players:2+n%3,difficulty:['easy','medium','hard'][n%3],seed:n+11}).state,{type:'remember'});let actions=0;while(s.phase!=='finished'&&actions++<1200){const reaction=s.players.flatMap((_,p)=>[chooseReaction(aiView(s,p))].filter(Boolean))[0];s=step(s,reaction||chooseAction(aiView(s),()=>.5));assertState(s);}assert.equal(s.phase,'finished',`reactive seed ${n+11}`);}});

function five(s,p){s.players[p].slots.push(s.deck.pop());return s;}
function miss(s,p){const rank=s.players[p].slots[0].rank;let j=s.deck.findIndex(c=>c.rank!==rank);s.discard.push(s.deck.splice(j,1)[0]);return transition(s,{type:'match',player:p,i:0});}
test('Six occupied cards eliminate; frozen board cannot react or be targeted',()=>{let s=five(ready(),0);s.active=1;const r=miss(s,0);s=r.state;assert.equal(s.players[0].eliminated,true);assert.equal(s.active,1);assert.equal(s.turn,0);assert.ok(r.events.some(e=>e.type==='eliminate'&&e.p===0));assert.throws(()=>step(s,{type:'match',player:0,i:0}),/out/);assert.equal(chooseReaction(aiView(s,0)),null);assert.equal(aiView(s,0).canTakeDiscard,false);put(s,'Q♥',s.deck,s.deck.length-1);s=step(s,{type:'draw'});assert.throws(()=>step(s,{type:'inspect',target:0,i:0}));s=step(s,{type:'skip'});for(let k=0;k<2;k++){s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});}assert.equal(s.active,1);});
test('Active elimination releases pending draw and advances exactly once',()=>{for(const rank of ['4♠','J♥','Q♥']){let s=ready();put(s,rank,s.deck,s.deck.length-1);s=step(s,{type:'draw'});const r=transition(s,{type:'forfeit',player:0});s=r.state;assert.equal(s.players[0].eliminated,true);assert.equal(s.active,1);assert.equal(s.phase,'ready');assert.equal(s.turn,1);assert.equal(s.held,null);assert.equal(s.discard.at(-1).id,rank);assert.ok(r.events.some(e=>e.type==='discard'));assertState(s);}});
test('Final turns skip eliminated players, including caller and last scheduled seat',()=>{let s=ready();for(const p of [0,1,3])five(s,p);s=step(s,{type:'buzz'});s=miss(s,0).state;assert.deepEqual(s.remaining,[1,2,3]);s=miss(s,1).state;assert.equal(s.active,2);assert.deepEqual(s.remaining,[2,3]);s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});s=miss(s,3).state;assert.equal(s.phase,'finished');assert.deepEqual(s.winners,[2]);assert.deepEqual(s.remaining,[]);});
test('Eliminating last scheduled seat preserves final reveal with multiple survivors',()=>{let s=five(ready(3),2);s=step(s,{type:'buzz'});
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});
 s=miss(s,2).state;assert.equal(s.players[2].eliminated,true);assert.deepEqual(s.remaining,[1]);
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});
 assert.equal(s.phase,'lastCall');assert.deepEqual(s.remaining,[]);s=step(s,{type:'finish'});assert.ok(s.winners.every(p=>p!==2));});
test('Two-handed buzz still gives both players a last turn',()=>{let s=ready(2);s=step(s,{type:'buzz'});
 assert.deepEqual(s.remaining,[0,1]);assert.equal(s.active,0);
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});
 assert.equal(s.active,1);assert.deepEqual(s.remaining,[1]);
 s=step(s,{type:'draw'});s=step(s,{type:['peek','swap'].includes(s.phase)?'skip':'discard'});
 assert.equal(s.phase,'lastCall');s=step(s,{type:'finish'});assert.equal(s.phase,'finished');});
test('An automatic call spends the turn that triggered it',()=>{let s=ready();
 // An emptied board calls the final round from a turn that is already over.
 for(let i=0;i<3;i++){s.discard.push(s.players[0].slots[i]);s.players[0].slots[i]=null;}
 s.knowledge=s.knowledge.map(()=>s.players.map(()=>[null,null,null,null]));
 put(s,'5♥',s.players[0].slots,3);put(s,'5♦',s.discard,s.discard.length-1);
 s=step(s,{type:'match',player:0,i:3});
 assert.equal(s.caller,0);assert.deepEqual(s.remaining,[1,2,3]);assert.equal(s.active,1);});
test('Last survivor wins and a pending draw returns to discard',()=>{let s=five(ready(2),1);put(s,'4♠',s.deck,s.deck.length-1);s=step(s,{type:'draw'});s=miss(s,1).state;assert.equal(s.phase,'finished');assert.equal(s.held,null);assert.equal(s.discard.at(-1).id,'4♠');assert.deepEqual(s.winners,[0]);assertState(s);});
test('Empty original slots do not count and extra positions are reused',()=>{let s=five(ready(),0);s.deck.unshift(s.players[0].slots[3]);s.players[0].slots[3]=null;s.knowledge.forEach(m=>m[0][3]=null);s=miss(s,0).state;assert.equal(s.players[0].slots.length,6);assert.equal(s.players[0].eliminated,false);assert.equal(s.players[0].slots[3],null);s=miss(s,0).state;assert.equal(s.players[0].slots.length,7);assert.equal(s.players[0].eliminated,true);assert.equal(s.players[0].slots[3],null);});
test('Eliminated low score is excluded from normal final winners',()=>{let s=ready(3);s.players[0].eliminated=true;s.active=1;for(const c of s.players[0].slots)s.deck.push(c);s.players[0].slots=[null,null,null,null];s.knowledge.forEach(m=>m[0]=[null,null,null,null]);s.phase='lastCall';s=step(s,{type:'finish'});assert.equal(s.totals[0],0);assert.ok(!s.winners.includes(0));});
test('120 complete seeded games with forced early eliminations conserve every card',()=>{for(let seed=1;seed<=120;seed++){let s=ready(2+seed%3,seed);five(s,0);s=miss(s,0).state;let n=0;while(s.phase!=='finished'&&n++<900){s=step(s,chooseAction(aiView(s),()=>.5));assertState(s);}assert.equal(s.phase,'finished');assert.ok(s.winners.every(p=>!s.players[p].eliminated));}});

test('Black Jacks and black Queens carry no power',()=>{for(const id of ['J♠','J♣','Q♠','Q♣']){let s=ready();put(s,id,s.deck,s.deck.length-1);s=step(s,{type:'draw'});assert.equal(s.phase,'decision',id);assert.equal(s.held.id,id);assert.throws(()=>step(s,{type:'peek',i:0}));assert.throws(()=>step(s,{type:'inspect',target:1,i:0}));s=step(s,{type:'discard'});assert.equal(s.discard.at(-1).id,id);assertState(s);}});
test('Queen inspect is optional: keeping leaves every card untouched and discards the Queen',()=>{let s=ready();put(s,'Q♦',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const ids=s.players.map(p=>p.slots.map(c=>c?.id??null));
 const look=transition(s,{type:'inspect',target:1,i:0});s=look.state;assert.equal(s.phase,'swapConfirm');
 // Looking teaches the actor both faces without moving anything.
 assert.deepEqual(s.players.map(p=>p.slots.map(c=>c?.id??null)),ids);
 assert.equal(s.knowledge[0][0][0].id,ids[0][0]);assert.equal(s.knowledge[0][1][0].id,ids[1][0]);assert.equal(s.knowledge[1][0][0],null);
 const r=transition(s,{type:'skip'});s=r.state;assert.ok(r.events.some(e=>e.type==='swapEnd'));
 assert.deepEqual(s.players.map(p=>p.slots.map(c=>c?.id??null)),ids);
 assert.equal(s.discard.at(-1).id,'Q♦');assert.equal(s.pending,null);assert.equal(s.active,1);assert.equal(s.turn,1);assertState(s);});
test('Position pairing is identical on both boards',()=>{let s=ready();put(s,'Q♥',s.deck,s.deck.length-1);s=step(s,{type:'draw'});const mine=s.players[0].slots[0].id,theirs=s.players[2].slots[0].id;
 s=step(s,{type:'inspect',target:2,i:0});s=step(s,{type:'swap'});
 assert.equal(s.players[0].slots[0].id,theirs);assert.equal(s.players[2].slots[0].id,mine);assertState(s);});
test('A reaction match during the Queen decision cancels the trade safely',()=>{let s=ready();put(s,'Q♥',s.deck,s.deck.length-1);s=step(s,{type:'draw'});
 s=step(s,{type:'inspect',target:1,i:0});const taken=s.players[1].slots[0];
 // Empty the target slot behind the pending trade, then confirm anyway.
 s.players[1].slots[0]=null;s.knowledge.forEach(m=>m[1][0]=null);s.discard.push(taken);
 const r=transition(s,{type:'swap'});assert.ok(r.events.some(e=>e.type==='swapEnd'));assert.equal(r.state.players[1].slots[0],null);assert.equal(r.state.discard.at(-1).id,'Q♥');assertState(r.state);});

test('A penalty cannot be thrown back onto the card it just uncovered',()=>{
 // Two sixes on the discard: the miss takes the top one, uncovering its twin.
 let s=ready();
 s.discard.push(s.deck.pop());
 put(s,'6♦',s.discard,s.discard.length-1);
 put(s,'6♣',s.discard,s.discard.length-2);
 put(s,'5♥',s.players[0].slots,3);
 const taken=s.discard.at(-1).id;
 s=step(s,{type:'match',player:0,i:3});
 const slot=s.players[0].slots.findIndex(c=>c?.id===taken);
 assert.ok(slot>=0,'the top discard became a penalty card');
 assert.equal(s.discard.at(-1).rank,'6','its twin is now uncovered');
 // Throwing it straight back would undo the penalty, so it is refused.
 assert.throws(()=>transition(s,{type:'match',player:0,i:slot}),/cannot go straight back/);
 // Anything discarded on top buries that twin, and the penalty is ordinary again.
 let n=step(s,{type:'draw'});
 n=n.phase==='decision'?step(n,{type:'discard'}):step(n,{type:'skip'});
 assert.notEqual(n.discard.at(-1).id,s.discard.at(-1).id,'a new card covers the twin');
 assert.doesNotThrow(()=>transition(n,{type:'match',player:0,i:slot}));
 assertState(n);
});
