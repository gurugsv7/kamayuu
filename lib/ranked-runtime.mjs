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

// Policy gets only aiView, never the engine state. Frozen configuration is a
// provisional policy v1: recall models missed observations, not secret knowledge.
export function chooseRankedBot(observation, config, key) {
  if (['memory','finished'].includes(observation.phase)) return null;
  const v = structuredClone(observation);
  for (let p = 0; p < v.players.length; p++) for (let i = 0; i < v.players[p].slots.length; i++) {
    const slot = v.players[p].slots[i];
    if (slot.known && roll(config.seed, `memory:${p}:${i}:${slot.known.id}`) > config.recall) slot.known = null;
  }
  v.difficulty = ['bronze','silver'].includes(config.tierId) ? 'easy' : config.tierId === 'gold' ? 'medium' : 'hard';
  for (const slot of v.players[v.active].slots) {
    if (v.locked && slot.known?.id===v.locked.card && v.discard?.id===v.locked.against) slot.known=null;
  }
  const reaction = chooseReaction(v);
  if (reaction && roll(config.seed, `react:${key}`) < config.reactionChance) return {action: reaction, reaction: true};
  if (!observation.isTurn || v.phase === 'lastCall') return null;
  const own = v.players[v.active].slots.filter(s => s.occupied);
  const estimate = own.reduce((n,s) => n + (s.known ? value(s.known) : 6.8), v.players[v.active].penalty);
  if (v.phase === 'ready' && v.caller === null && v.turn >= v.players.length && estimate <= 10 + config.buzzOffset) {
    return {action: {type: 'buzz'}, reaction: false};
  }
  if (v.phase === 'decision' && v.source === 'deck') {
    const slots = v.players[v.active].slots.flatMap((s,i) => s.occupied ? [{i, score:s.known ? value(s.known) : 6.8}] : []);
    slots.sort((a,b) => b.score - a.score);
    return {action: slots[0] && value(v.held) < slots[0].score - config.replaceMargin
      ? {type:'replace',i:slots[0].i} : {type:'discard'}, reaction:false};
  }
  // chooseAction normally matches immediately; honor a sampled missed reaction
  // by omitting the matching observation for this ready-phase decision.
  if (reaction && v.phase === 'ready') for (const slot of v.players[v.active].slots) {
    if (slot.known?.rank === v.discard?.rank) slot.known = null;
  }
  let action=chooseAction(v,()=>roll(config.seed,`choice:${key}`));
  if (v.phase==='ready' && action.type==='buzz' && own.length && v.turn<160 && estimate>10+config.buzzOffset) action={type:'draw'};
  return {action,reaction:false};
}

export function planRankedJob(room, participants, now = Date.now(), previousJob = null) {
  if (room.state.phase === 'finished') return {due:null,payload:{}};
  const s = room.state;
  let next = {due:room.deadline,payload:{type:'timeout'}};
  const ranked=room.ranked ||= {};
  const plans=ranked.botPlans ||= {};
  for (const p of participants.filter(p => p.kind === 'bot' && !s.players[p.seat].eliminated)) {
    let decision;
    const key = `${s.turn}:${s.phase}:${s.discard.at(-1)?.id || ''}:${p.seat}`;
    if (s.phase === 'memory') {
      if(room.memorySeen.includes(p.id))continue;
      decision = {action:null,reaction:false,command:'remember'};
    }
    else {
      const observation = {...aiView(s,p.seat),isTurn:s.active===p.seat,locked:s.players[p.seat].locked};
      decision = chooseRankedBot(observation,p.bot_config,key);
    }
    if (!decision) continue;
    const cfg = p.bot_config;
    const delay = rivalDelay(cfg,s.phase,decision.action,key,decision.reaction);
    const signature = `${key}:${JSON.stringify(decision)}`;
    // A hold/recover must not restart an already-sampled bot observation delay.
    const saved=plans[p.seat];
    const due = saved?.signature===signature ? saved.due : previousJob?.payload?.signature===signature ? previousJob.due : now+delay;
    plans[p.seat]={signature,due};
    if (due < next.due) next = {due,payload:{type:'bot',seat:p.seat,...decision,signature}};
  }
  if(ranked.pendingSocial && ranked.pendingSocial.due<next.due)next={due:ranked.pendingSocial.due,payload:{type:'social'}};
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
  queueRivalSocial(r.room,record.participants,r.events,now);
  r.room.ranked.lastEvents=r.events;
  return {...r,next:planRankedJob(r.room,record.participants,now)};
}

export function applyRankedHuman(record, userId, input, now = Date.now(), previousJob = null) {
  // Claim once per opened turn/phase; repeated holds cannot extend it indefinitely.
  const seat = record.participants.find(p=>p.kind==='human' && p.user_id===userId);
  const claimKey = `${record.data.state.turn}:${record.data.state.phase}:${seat?.seat}`;
  const r = rankedHumanIntent(record.data,record.participants,userId,input,now);
  queueRivalSocial(r.room,record.participants,r.events,now);
  if(['emote','message'].includes(input.command)) {
    const event=r.events[0];
    if(event)appendSocial(r.room,event,now);
    r.events=[];
  }
  r.room.ranked.lastEvents=r.events;
  if (input.command === 'hold' && seat?.seat===record.data.state.active && !['memory','lastCall','finished'].includes(record.data.state.phase)) {
    if (record.data.ranked?.claimKey === claimKey) r.room.deadline=record.data.deadline;
    else r.room.ranked={...r.room.ranked,claimKey};
  }
  return {...r,next:planRankedJob(r.room,record.participants,now,previousJob)};
}
