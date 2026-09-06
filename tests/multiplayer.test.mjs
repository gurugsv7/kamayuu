import test from 'node:test';
import assert from 'node:assert/strict';
import {newRoom,applyIntent,playerPacket,secureGame,TURN_MS} from '../lib/multiplayer-rules.mjs';
import {assertState,transition} from '../lib/engine.mjs';
const users=['a','b','c','d'];
function started(n=4){let r=newRoom('a','Alice',0);for(let p=1;p<n;p++)r=applyIntent(r,users[p],{command:'join',name:'Player '+p},0).room;for(const user of users.slice(0,n))r=applyIntent(r,user,{command:'ready',ready:true},0).room;return applyIntent(r,'a',{command:'start'},0);}
function ready(n=4){let r=started(n).room;for(const user of users.slice(0,n))r=applyIntent(r,user,{command:'remember'},10).room;return r;}
function packet(r,p,events=[]){return playerPacket({id:'room',code:'ABC123',version:5,data:r},users[p],events);}
test('Secure shuffle conserves cards and does not repeat solo seeded order',()=>{const a=secureGame(4),b=secureGame(4);assertState(a.state);assertState(b.state);assert.notDeepEqual(a.state.deck,b.state.deck);});
test('Opening payload has only your bottom two faces, no deck or knowledge secrets',()=>{const {room,events}=started();for(let p=0;p<4;p++){const v=packet(room,p,events);assert.equal(v.state.players[0].slots[0].rank,undefined);assert.ok(v.state.players[0].slots[2].rank);assert.ok(v.state.players[0].slots[3].rank);assert.equal(v.state.players[1].slots[2].rank,undefined);assert.equal(v.state.deck,undefined);assert.equal(v.state.deckCount,52-4*4-1);assert.equal(v.state.knowledge,undefined);assert.equal(v.state.seed,undefined);assert.equal(v.state.active,(4-p)%4);}});
test('Host start and membership checks; four-player room limit',()=>{let r=newRoom('a','<b>Alice</b>');assert.ok(!r.members[0].name.includes('<'));assert.throws(()=>applyIntent(r,'x',{command:'ready',ready:true}));assert.throws(()=>applyIntent(r,'a',{command:'start'}));r=started().room;assert.throws(()=>applyIntent(r,'x',{command:'join'}));assert.throws(()=>packet(r,5));});
test('Wrong turn and forged powers cannot mutate authoritative state',()=>{const r=ready();for(const a of [{type:'draw'},{type:'swap',target:0,i:0},{type:'peek',i:0},{type:'buzz'}])assert.throws(()=>applyIntent(r,'b',{command:'action',action:a}));assert.throws(()=>applyIntent(r,'a',{command:'action',action:{type:'forfeit',player:1}}));});
test('Ordinary draw is private; replacement is public only for outgoing card',()=>{let r=ready();let j=r.state.deck.findIndex(c=>c.rank==='4');[r.state.deck[j],r.state.deck[r.state.deck.length-1]]=[r.state.deck.at(-1),r.state.deck[j]];let x=applyIntent(r,'a',{command:'action',action:{type:'draw'}});r=x.room;assert.ok(packet(r,0,x.events).events[0].card);assert.equal(packet(r,1,x.events).events[0].card,undefined);assert.equal(packet(r,1).state.held.rank,undefined);x=applyIntent(r,'a',{command:'action',action:{type:'replace',i:0}});assert.ok(packet(x.room,1,x.events).events[0].old);assert.equal(packet(x.room,1,x.events).events[0].card,undefined);});
test('Jack and Queen identities reach only their actor',()=>{for(const rank of ['J','Q']){let r=ready();const row=[r.state.deck,r.state.discard,...r.state.players.map(p=>p.slots)].find(a=>a.some(c=>c?.rank===rank&&c.suit==='♥'));let j=row.findIndex(c=>c?.rank===rank&&c.suit==='♥');[row[j],r.state.deck[r.state.deck.length-1]]=[r.state.deck.at(-1),row[j]];r.state.knowledge=r.state.knowledge.map(()=>r.state.players.map(()=>[null,null,null,null]));r=applyIntent(r,'a',{command:'action',action:{type:'draw'}}).room;const x=applyIntent(r,'a',{command:'action',action:rank==='J'?{type:'peek',i:0}:{type:'inspect',target:1,i:0}});const actor=packet(x.room,0,x.events).events[0],other=packet(x.room,1,x.events).events[0];assert.ok(rank==='J'?actor.card:actor.mine&&actor.theirs);assert.equal(other.card,undefined);assert.equal(other.mine,undefined);assert.equal(other.theirs,undefined);
 if(rank==='Q'){const y=applyIntent(x.room,'a',{command:'action',action:{type:'swap'}});const seen=packet(y.room,1,y.events).events[0];assert.equal(seen.type,'swap');assert.equal(seen.incoming,undefined);assert.equal(seen.outgoing,undefined);}}});
test('Recover never displays a permanent memory cheat sheet',()=>{const r=ready();const v=packet(r,0);assert.ok(v.state.players.every(p=>p.slots.every(c=>!c||!c.rank)));});
test('Deadlines cannot be accelerated and disconnected turn forfeits once',()=>{let r=ready(2);assert.throws(()=>applyIntent(r,'b',{command:'timeout'},r.deadline-1));const x=applyIntent(r,'b',{command:'timeout'},r.deadline);assert.equal(x.room.state.phase,'finished');assert.deepEqual(x.room.state.winners,[1]);assert.equal(x.room.deadline,null);});

test('Only the Queen holder sees the inspected pair, and declining spends the Queen',()=>{let r=ready();const row=[r.state.deck,r.state.discard,...r.state.players.map(p=>p.slots)].find(a=>a.some(c=>c?.rank==='Q'&&c.suit==='♦'));const j=row.findIndex(c=>c?.rank==='Q'&&c.suit==='♦');[row[j],r.state.deck[r.state.deck.length-1]]=[r.state.deck.at(-1),row[j]];r.state.knowledge=r.state.knowledge.map(()=>r.state.players.map(()=>[null,null,null,null]));
 r=applyIntent(r,'a',{command:'action',action:{type:'draw'}}).room;
 const look=applyIntent(r,'a',{command:'action',action:{type:'inspect',target:1,i:0}});
 assert.equal(look.room.state.phase,'swapConfirm');
 // Opponents learn that a decision is open, never which cards it involves.
 const watcher=packet(look.room,1,look.events);assert.deepEqual(watcher.state.pending,{target:0,i:0});assert.ok(watcher.state.players.every(p=>p.slots.every(c=>!c||!c.rank)));
 // The chooser keeps both faces for as long as the choice is open; the next packet
 // must not undo the reveal they were already shown in the inspect event.
 const chooser=packet(look.room,0,look.events);
 assert.ok(chooser.state.players[0].slots[0].rank);assert.ok(chooser.state.players[1].slots[0].rank);
 assert.equal(chooser.state.players[1].slots[1].rank,undefined);assert.ok(chooser.state.players[2].slots.every(c=>!c||!c.rank));
 assert.throws(()=>applyIntent(look.room,'b',{command:'action',action:{type:'swap'}}));
 const before=look.room.state.players.map(p=>p.slots.map(c=>c.id));
 const kept=applyIntent(look.room,'a',{command:'action',action:{type:'skip'}});
 assert.deepEqual(kept.room.state.players.map(p=>p.slots.map(c=>c.id)),before);
 assert.equal(kept.room.state.discard.at(-1).rank,'Q');assertState(kept.room.state);});
test('Leaving a two-player match hands the win to the player still seated',()=>{let r=ready(2);const {room,events}=applyIntent(r,'b',{command:'leave'},20);
 assert.equal(room.state.phase,'finished');assert.deepEqual(room.state.winners,[0]);assert.ok(events.some(e=>e.type==='eliminate'&&e.reason==='forfeit'));
 assert.deepEqual(room.departed,['b']);assert.equal(room.members.length,2,'seats stay put while a state exists');
 assert.equal(applyIntent(ready(2),'a',{command:'leave'},20).room.host,'b','a departing host hands the room to whoever is left');
 assert.equal(room.deadline,null,'a finished room stops running a turn clock');
 const view=playerPacket({id:'room',code:'ABC123',version:6,data:room},'a',events);assert.equal(view.state.phase,'finished');assert.deepEqual(view.state.winners,[0]);});
test('Only the host can rematch, and only once the match is over',()=>{let r=ready(3);
 assert.throws(()=>applyIntent(r,'a',{command:'rematch'},30),/still in play/);
 assert.throws(()=>applyIntent(r,'b',{command:'rematch'},30),/still in play/);
 r=applyIntent(r,'c',{command:'leave'},30).room;r=applyIntent(r,'b',{command:'leave'},31).room;
 assert.equal(r.state.phase,'finished');
 assert.throws(()=>applyIntent(r,'b',{command:'rematch'},32),/host/);
 const {room}=applyIntent(r,'a',{command:'rematch'},33);
 assert.equal(room.state,null);assert.equal(room.matchId,null);assert.equal(room.deadline,null);
 assert.deepEqual(room.members.map(m=>m.id),['a'],'players who walked out are not waited on');
 assert.deepEqual(room.departed,[]);assert.ok(room.members.every(m=>!m.ready));
 // The room is a lobby again: someone new can join and start a fresh match.
 let next=applyIntent(room,'d',{command:'join',name:'Dana'},34).room;
 for(const user of ['a','d'])next=applyIntent(next,user,{command:'ready',ready:true},35).room;
 next=applyIntent(next,'a',{command:'start'},36).room;
 assert.equal(next.state.phase,'memory');assert.equal(next.state.players.length,2);assertState(next.state);});
test('A rematch on a room that is already a lobby changes nothing',()=>{let r=newRoom('a','Alice',0);r=applyIntent(r,'b',{command:'join',name:'Bo'},0).room;
 const {room,events}=applyIntent(r,'a',{command:'rematch'},1);assert.equal(events.length,0);assert.deepEqual(room.members.map(m=>m.id),['a','b']);});
test('A buzz from the finisher (a non-active player) reaches the engine, but an unrelated non-active player is still rejected',()=>{
 let r=ready(4);
 // Force a black (never a power card) draw so the turn resolves through a plain discard.
 let j=r.state.deck.findIndex(c=>!['♥','♦'].includes(c.suit));
 [r.state.deck[j],r.state.deck[r.state.deck.length-1]]=[r.state.deck.at(-1),r.state.deck[j]];
 r=applyIntent(r,'a',{command:'action',action:{type:'draw'}}).room;
 assert.equal(r.state.phase,'decision');
 r=applyIntent(r,'a',{command:'action',action:{type:'discard'}}).room;
 // Turn has passed to b (seat 1); a (seat 0) is the player who just finished.
 assert.equal(r.state.active,1);assert.equal(r.state.turn,1);assert.equal(r.state.caller,null);
 const before=r.deadline;
 // An unrelated non-active player (c, seat 2) may not buzz in this gap: the multiplayer
 // gate now lets `buzz` actions from any non-active, non-eliminated player through to
 // the engine, so this rejection must come from the engine's own `previousPlayer` check,
 // not from a duplicated "is this really the finisher" guard in the multiplayer layer.
 assert.throws(()=>applyIntent(r,'c',{command:'action',action:{type:'buzz'}},before+1),/Only the player who just finished may buzz here/);
 // The finisher (a) buzzing here is accepted and starts the final round without
 // taking a's own turn (a is excluded from `remaining`), and b (already next in
 // line) is left untouched as the active player.
 const {room}=applyIntent(r,'a',{command:'action',action:{type:'buzz'}},before+1);
 assert.equal(room.state.caller,0);assert.equal(room.state.active,1);assert.deepEqual(room.state.remaining,[1,2,3]);
 // The buzz itself must reset the turn clock even though turn/active/phase are all
 // numerically unchanged by it (only `caller`/`remaining` change) — otherwise the
 // final round would inherit whatever was left of the pre-buzz timer.
 assert.equal(room.deadline,before+1+TURN_MS);
 // An eliminated player can never buzz, regardless of action-type gating.
 r.state.players[0].eliminated=true;
 assert.throws(()=>applyIntent(r,'a',{command:'action',action:{type:'buzz'}}),/not your turn/);
});
