import {aiView, chooseAction, chooseReaction, value} from './engine.mjs';
import {applyIntent} from './multiplayer-rules.mjs';
import {createRankedRoom, rankedHumanIntent} from './ranked-room.mjs';
import {rivalDelay,queueRivalSocial,appendSocial} from './rival-personality.mjs';

function roll(seed, key) {
  let h = seed >>> 0;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Ages are counted in this rival's completed turns, never polls or animations.
// Forgotten cards stay unknown until a legitimate reveal refreshes the memory.
export function rankedBotObservation(room,participant) {
  const s=room.state,seat=participant.seat,cfg=participant.bot_config;
  const v={...aiView(s,seat),isTurn:s.active===seat,locked:s.players[seat].locked};
  const ranked=room.ranked||={},turn=(ranked.botTurns||{})[seat]||0;
  const all=ranked.botMemory||={},memory=all[seat]||=[];
  const grace={bronze:3,silver:4,gold:5,platinum:7,diamond:9}[cfg.tierId]||3;
  for(let p=0;p<v.players.length;p++) {
    const row=memory[p]||=[];
    for(let i=0;i<v.players[p].slots.length;i++) {
      const slot=v.players[p].slots[i];
      if(!slot.known){row[i]=null;continue;}
      let entry=row[i];
      if(!entry||entry.id!==slot.known.id)entry=row[i]={id:slot.known.id,learnedAt:turn,checkedAt:turn,forgotten:false};
      const own=p===seat,protectedTurns=own?grace+(value(slot.known)<=2?2:0):1;
      if(turn-entry.learnedAt>=protectedTurns&&entry.checkedAt<turn) {
        entry.checkedAt=turn;
        const chance=(1-cfg.recall)*(own?0.35:1);
        if(roll(cfg.seed,`forget:${p}:${i}:${entry.id}:${turn}`)<chance)entry.forgotten=true;
      }
      if(entry.forgotten)slot.known=null;
    }
  }
  return v;
}

function recordRivalLearning(room,participants,events,before) {
  const ranked=room.ranked||={},turns=ranked.botTurns||={};
  for(const p of participants.filter(p=>p.kind==='bot')) {
    if(before.active===p.seat&&room.state.turn>before.turn)turns[p.seat]=(turns[p.seat]||0)+1;
    for(const e of events)if(e.p===p.seat&&['peek','inspect'].includes(e.type)) {
      const positions=e.type==='peek'?[[p.seat,e.i]]:[[p.seat,e.i],[e.target,e.i]];
      for(const [owner,i] of positions) {
        const memory=ranked.botMemory?.[p.seat]?.[owner]?.[i];
        if(memory){memory.learnedAt=turns[p.seat]||0;memory.checkedAt=memory.learnedAt;memory.forgotten=false;}
      }
    }
  }
}

// This policy only receives legally observed, recency-filtered cards.
export function chooseRankedBot(observation, config, key) {
  if (['memory','finished'].includes(observation.phase)) return null;
  const v = structuredClone(observation);
  v.difficulty = ['bronze','silver'].includes(config.tierId) ? 'easy' : config.tierId === 'gold' ? 'medium' : 'hard';
  // Matching restrictions must not erase knowledge used for replacements.
  const reactionView=structuredClone(v);
  for (const slot of reactionView.players[v.active].slots) {
    if (v.locked && slot.known?.id===v.locked.card && v.discard?.id===v.locked.against) slot.known=null;
  }
  const reaction = chooseReaction(reactionView);
  if (reaction && roll(config.seed, `react:${key}`) < config.reactionChance) return {action: reaction, reaction: true};
  if (!observation.isTurn || v.phase === 'lastCall') return null;
  const own = v.players[v.active].slots.filter(s => s.occupied);
  const estimate = own.reduce((n,s) => n + (s.known ? value(s.known) : 6.8), v.players[v.active].penalty);
  if (v.phase === 'ready' && v.caller === null && (!own.length || v.turn>160 || v.turn >= v.players.length && estimate <= 10 + config.buzzOffset)) {
    return {action: {type: 'buzz'}, reaction: false};
  }
  const slots = v.players[v.active].slots.flatMap((s,i) => s.occupied ? [{i,known:!!s.known,score:s.known ? value(s.known) : 6.8}] : []);
  const cardId=v.held?.id||v.discard?.id||'';
  slots.sort((a,b)=>b.score-a.score || roll(config.seed,`slot:${v.turn}:${cardId}:${a.i}`)-roll(config.seed,`slot:${v.turn}:${cardId}:${b.i}`));
  const worst=slots[0];
  // A known 3 -> 2 is useful. Unseen slots use a cautious estimate, never truth.
  const margin=worst?.known ? Math.min(config.replaceMargin,0.6) : config.replaceMargin;
  if(v.phase==='ready') {
    return {action:v.canTakeDiscard&&v.discard&&worst&&value(v.discard)<worst.score-margin
      ? {type:'take'} : {type:'draw'},reaction:false};
  }
  if(v.phase==='decision') {
    return {action:worst&&(v.source==='discard'||value(v.held)<worst.score-margin)
      ? {type:'replace',i:worst.i} : {type:'discard'},reaction:false};
  }
  if(v.phase==='peek'&&slots.every(s=>s.known))return {action:{type:'skip'},reaction:false};
  if(v.phase==='swapConfirm') {
    const mine=v.players[v.active].slots[v.pending.i],theirs=v.players[v.pending.target].slots[v.pending.i];
    return {action:{type:!v.players[v.pending.target].eliminated&&mine?.occupied&&theirs?.occupied&&mine.known&&theirs.known&&value(mine.known)>value(theirs.known)?'swap':'skip'},reaction:false};
  }
  return {action:chooseAction(v,()=>roll(config.seed,`choice:${key}`)),reaction:false};
}

export function planRankedJob(room, participants, now = Date.now(), previousJob = null) {
  if (room.state.phase === 'finished') return {due:null,payload:{}};
  const s = room.state;
  let next = {due:room.deadline,payload:{type:'timeout'}};
  const ranked=room.ranked ||= {};
  const plans=ranked.botPlans ||= {};
  for (const p of participants.filter(p => p.kind === 'bot' && !s.players[p.seat].eliminated)) {
    let decision;
    const observation=rankedBotObservation(room,p);
    const key = `${s.turn}:${s.phase}:${s.discard.at(-1)?.id || ''}:${p.seat}`;
    if (s.phase === 'memory') {
      if(room.memorySeen.includes(p.id))continue;
      decision = {action:null,reaction:false,command:'remember'};
    }
    else {
      decision = chooseRankedBot(observation,p.bot_config,key);
    }
    if (!decision) continue;
    const cfg = p.bot_config;
    const delay = rivalDelay(cfg,s.phase,decision.action,key,decision.reaction);
    const signature = `${key}:${JSON.stringify(decision)}`;
    // A hold/recover must not restart an already-sampled bot observation delay.
    const saved=plans[p.seat];
    const due = Math.max(room.presentationUntil||0,saved?.signature===signature ? saved.due : previousJob?.payload?.signature===signature ? previousJob.due : Math.max(now,room.presentationUntil||0)+delay);
    plans[p.seat]={signature,due};
    if (due < next.due) next = {due,payload:{type:'bot',seat:p.seat,...decision,signature}};
  }
  if(ranked.pendingSocial){const due=Math.max(ranked.pendingSocial.due,room.presentationUntil||0);if(due<next.due)next={due,payload:{type:'social'}};}
  return next;
}

export function bootstrapRanked(record, now = Date.now()) {
  const r = createRankedRoom(record.participants,now);
  r.room.matchId = record.id;
  if(record.opening_seat!==null && record.opening_seat!==undefined)r.room.state.active=record.opening_seat;
  r.room.ranked.openingSeat=r.room.state.active;
  r.room.ranked.lastEvents=r.events;
  return {...r,next:planRankedJob(r.room,record.participants,now)};
}

export function advanceRanked(record, job, now = Date.now()) {
  if (record.version !== job.expected_version) throw Error('Stale ranked job');
  let r;
  if(job.payload.type==='social') {
    const room=structuredClone(record.data),pending=room.ranked.pendingSocial;
    if(pending){appendSocial(room,pending.event,now);room.ranked.lastSocialAt=now;room.ranked.socialCount=(room.ranked.socialCount||0)+1;delete room.ranked.pendingSocial;}
    r={room,events:[]};
  } else if (job.payload.type === 'bot') {
    const p = record.participants.find(p => p.kind === 'bot' && p.seat === job.payload.seat);
    if (!p) throw Error('Unknown bot seat');
    // A queued bot move is revalidated by the same trusted rules as a human move.
    r = applyIntent(record.data,p.id,job.payload.command ? {command:job.payload.command}
      : {command:'action',action:job.payload.action},now);
  } else {
    r = applyIntent(record.data,record.participants[0].id,{command:'timeout'},now);
  }
  recordRivalLearning(r.room,record.participants,r.events,record.data.state);
  queueRivalSocial(r.room,record.participants,r.events,now);
  r.room.ranked.lastEvents=r.events;
  return {...r,next:planRankedJob(r.room,record.participants,now)};
}

export function applyRankedHuman(record, userId, input, now = Date.now(), previousJob = null) {
  const r = rankedHumanIntent(record.data,record.participants,userId,input,now);
  recordRivalLearning(r.room,record.participants,r.events,record.data.state);
  queueRivalSocial(r.room,record.participants,r.events,now);
  if(['emote','message'].includes(input.command)) {
    const event=r.events[0];
    if(event)appendSocial(r.room,event,now);
    r.events=[];
  }
  r.room.ranked.lastEvents=r.events;
  return {...r,next:planRankedJob(r.room,record.participants,now,previousJob)};
}
