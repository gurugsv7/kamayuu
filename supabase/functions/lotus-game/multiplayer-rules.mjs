// Trusted multiplayer orchestration. This module runs on the Edge, never in the game client.
import {createGame, transition, canTakeDiscard} from './engine.mjs';

export const TURN_MS = 120_000;
export function cleanName(name) {
  const result=String(name||'').normalize('NFKC').replace(/[^\p{L}\p{N} _-]/gu,'').trim().slice(0,16);
  return result||'Guest';
}
export function newRoom(userId,name,now=Date.now()) {
  return {host:userId,members:[{id:userId,name:cleanName(name),ready:false}],state:null,matchId:null,deadline:null,memorySeen:[],receipts:[],departed:[],createdAt:now};
}
export function secureGame(players,random=crypto) {
  // Fisher–Yates uses rejection sampling from the server CSPRNG, independent of the solo seed.
  const result=createGame({players,difficulty:'hard',seed:1});
  const cards=[...result.state.deck,...result.state.discard,...result.state.players.flatMap(p=>p.slots)];
  for(let i=cards.length-1;i>0;i--){const n=i+1,limit=Math.floor(0x100000000/n)*n;let x;do{x=random.getRandomValues(new Uint32Array(1))[0];}while(x>=limit);[cards[i],cards[x%n]]=[cards[x%n],cards[i]];}
  const s=result.state;for(let p=0;p<players;p++)for(let i=0;i<4;i++)s.players[p].slots[i]=cards.pop();
  s.deck=cards;s.discard=[s.deck.pop()];s.knowledge=s.players.map((_,o)=>s.players.map((p,q)=>p.slots.map((c,i)=>o===q&&i>=2?c:null)));
  result.events.at(-1).card=s.discard[0];return result;
}
export function applyIntent(before,userId,input,now=Date.now()) {
  const room=structuredClone(before),p=room.members.findIndex(m=>m.id===userId);let events=[];
  if(input.command==='join'){
    if(p>=0)return {room,events};
    if(room.state||room.members.length>=4)throw Error('This room is full or already playing.');
    room.members.push({id:userId,name:cleanName(input.name),ready:false});return {room,events};
  }
  if(p<0)throw Error('You are not a member of this room.');
  const s=room.state;
  if(input.command==='ready'){
    if(s)throw Error('The match has already started.');room.members[p].ready=!!input.ready;
  }else if(input.command==='start'){
    if(room.host!==userId||s||room.members.length<2||room.members.some(m=>!m.ready))throw Error('The host can start when everyone is ready.');
    const deal=secureGame(room.members.length);room.state=deal.state;events=deal.events;room.matchId=crypto.randomUUID();room.memorySeen=[];room.deadline=now+30_000;
    room.state.players.forEach((player,i)=>player.name=room.members[i].name);
  }else if(input.command==='remember'){
    if(s?.phase!=='memory')return {room,events};
    if(!room.memorySeen.includes(userId))room.memorySeen.push(userId);
    if(room.members.every((m,i)=>s.players[i].eliminated||room.memorySeen.includes(m.id))){const r=transition(s,{type:'remember'});room.state=r.state;events=r.events;room.deadline=now+TURN_MS;}
  }else if(input.command==='leave'){
    if(!s){room.members.splice(p,1);if(room.host===userId)room.host=room.members[0]?.id||null;}
    else{
      // Seats map to state by index, so a mid-match leaver keeps their seat and is
      // only dropped when the room returns to the lobby. Forfeiting hands the win
      // to the last player standing.
      room.departed=[...new Set([...(room.departed||[]),userId])];
      // A host who walks out hands the room over, or nobody could ever restart it.
      if(room.host===userId){const heir=room.members.find(m=>m.id!==userId&&!room.departed.includes(m.id));if(heir)room.host=heir.id;}
      if(s.phase!=='finished'&&!s.players[p].eliminated){const r=transition(s,{type:'forfeit',player:p});room.state=r.state;events=r.events;room.deadline=now+TURN_MS;}
    }
  }else if(input.command==='rematch'){
    if(!s)return {room,events};
    if(s.phase!=='finished')throw Error('The match is still in play.');
    if(room.host!==userId)throw Error('Only the host can start a rematch.');
    room.state=null;room.matchId=null;room.memorySeen=[];room.deadline=null;
    room.members=room.members.filter(m=>!(room.departed||[]).includes(m.id));
    room.departed=[];room.members.forEach(m=>{m.ready=false;});
    if(!room.members.some(m=>m.id===room.host))room.host=room.members[0]?.id||null;
  }else if(input.command==='timeout'){
    if(!s||!room.deadline||now<room.deadline||s.phase==='finished')throw Error('The turn is still open.');
    if(s.phase==='lastCall'){const r=transition(s,{type:'finish'});room.state=r.state;events=r.events;}
    else if(s.phase==='memory'){
      let current=transition(s,{type:'remember'}).state;
      for(let q=0;q<room.members.length;q++)if(!room.memorySeen.includes(room.members[q].id)&&current.phase!=='finished'&&!current.players[q].eliminated){const r=transition(current,{type:'forfeit',player:q});current=r.state;events.push(...r.events);}
      room.state=current;room.deadline=now+TURN_MS;events.unshift({type:'memoryEnd'});
    }else{const r=transition(s,{type:'forfeit',player:s.active});room.state=r.state;events=r.events;room.deadline=now+TURN_MS;}
  }else if(input.command==='action'){
    if(!s||s.phase==='memory'||s.phase==='finished')throw Error('There is no active turn.');
    const a=input.action||{};
    if(!['draw','take','replace','discard','peek','inspect','swap','skip','match','buzz'].includes(a.type))throw Error('Unknown action.');
    // A buzz from the player who just finished their turn is, by definition, made by a
    // non-active player — the engine's `previousPlayer` check is the single source of
    // truth for whether the caller really is that finisher, so this gate only needs to
    // let `buzz` (like the existing `match` reaction) through to it, not re-derive who
    // may buzz. `player` below is still assigned server-side from the authenticated
    // caller, so nothing here lets a client spoof whose buzz it is.
    if(s.players[p].eliminated||(a.type!=='match'&&a.type!=='buzz'&&p!==s.active))throw Error('It is not your turn.');
    // The player ID and all card identities are assigned here, never accepted from the caller.
    const action={type:a.type,i:a.i,target:a.target,player:p};
    if(a.type==='match')action.expectedDiscard=a.expectedDiscard;
    const r=transition(s,action);room.state=r.state;events=r.events;
    // `&&` binds tighter than `||` here, so without the fix this parsed as
    // `turnChanged || activeChanged || (phaseChanged && isBuzz)` — a buzz that doesn't
    // also flip the phase (the common case: a non-active finisher's buzz leaves
    // `active`/`turn`/`phase` numerically unchanged, since the next player was already
    // next in line) fell through without resetting the deadline, so the final round
    // could inherit an almost-expired timer. Any `buzz` now unconditionally resets it.
    if(r.state.turn!==s.turn||r.state.active!==s.active||r.state.phase!==s.phase||a.type==='buzz')room.deadline=now+TURN_MS;
  }else throw Error('Unknown request.');
  if(room.state?.phase==='lastCall')room.deadline=now+5_000;
  if(room.state?.phase==='finished')room.deadline=null;
  return {room,events};
}

export function playerPacket(record,userId,events=[],recover=false) {
  const room=record.data,seat=room.members.findIndex(m=>m.id===userId);
  if(seat<0)throw Error('You are not a member of this room.');
  const n=room.members.length,rotate=p=>p==null?null:(p-seat+n)%n,order=Array.from({length:n},(_,i)=>(seat+i)%n),s=room.state;
  const metadata={id:record.id,code:record.code,version:record.version,host:room.host,me:userId,members:room.members,matchId:room.matchId,deadline:room.deadline,serverTime:Date.now()};
  if(!s)return {room:metadata,state:null,events:[],recover};
  const top=s.discard.at(-1),showHeld=s.active===seat||s.source==='discard'||['peek','swap','swapConfirm'].includes(s.phase);
  const state={phase:s.phase,active:rotate(s.active),turn:s.turn,round:s.round,caller:rotate(s.caller),remaining:s.remaining.map(rotate),source:s.source,
    pending:s.pending?{target:rotate(s.pending.target),i:s.pending.i}:null,
    held:s.held?(showHeld?s.held:{id:'held'}):null,deckCount:s.deck.length,discard:s.discard.slice(-2),discardOwners:top?{[top.id]:rotate(s.discardOwners[top.id])}:{},
    // The Queen's chooser already saw both faces in the inspect event, so keep that
    // pair unmasked for them until they trade or keep — otherwise the reveal is
    // undone by the next packet. Nobody else sees it, and only while pending.
    players:order.map(q=>({...s.players[q],name:q===seat?'You':room.members[q].name,slots:s.players[q].slots.map((c,i)=>!c?null:s.phase==='finished'||s.phase==='memory'&&q===seat&&i>=2||s.phase==='swapConfirm'&&s.active===seat&&s.pending?.i===i&&(q===seat||q===s.pending.target)?c:{id:`slot-${q}-${i}`})})),
    totals:order.map(q=>s.totals[q]),winners:s.winners.map(rotate),remote:true,canTakeDiscard:canTakeDiscard(s,seat)};
  const visible=events.map(e=>{
    const out={...e};
    if(e.type==='draw'&&e.p!==seat&&!e.public)delete out.card;
    if(e.type==='replace'&&e.p!==seat&&!e.public)delete out.card;
    if(e.type==='peek'&&e.p!==seat)delete out.card;
    if(e.type==='inspect'&&e.p!==seat){delete out.mine;delete out.theirs;}
    if(e.type==='swap'&&e.p!==seat){delete out.incoming;delete out.outgoing;}
    if('p' in out)out.p=rotate(out.p);if('target' in out)out.target=rotate(out.target);if(out.totals)out.totals=state.totals;
    return out;
  });
  return {room:metadata,state,events:visible,recover};
}
