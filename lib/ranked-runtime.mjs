import {aiView, chooseAction, chooseReaction, value} from './engine.mjs';
import {applyIntent} from './multiplayer-rules.mjs';
import {createRankedRoom, rankedHumanIntent} from './ranked-room.mjs';

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
  for (const p of participants.filter(p => p.kind === 'bot' && !s.players[p.seat].eliminated)) {
    let decision;
    const key = `${s.turn}:${s.phase}:${s.discard.at(-1)?.id || ''}:${p.seat}`;
    if (s.phase === 'memory') decision = {action:null,reaction:false,command:'remember'};
    else {
      const observation = {...aiView(s,p.seat),isTurn:s.active===p.seat,locked:s.players[p.seat].locked};
      decision = chooseRankedBot(observation,p.bot_config,key);
    }
    if (!decision) continue;
    const cfg = p.bot_config;
    const delay = decision.reaction
      ? cfg.reactionMinMs + roll(cfg.seed,`delay:${key}`)*(cfg.reactionMaxMs-cfg.reactionMinMs)
      : (850+roll(cfg.seed,`delay:${key}`)*900)*cfg.delayScale;
    const signature = `${key}:${JSON.stringify(decision)}`;
    // A hold/recover must not restart an already-sampled bot observation delay.
    const due = previousJob?.payload?.signature===signature ? previousJob.due : now+Math.round(delay);
    if (due < next.due) next = {due,payload:{type:'bot',seat:p.seat,...decision,signature}};
  }
  return next;
}

export function bootstrapRanked(record, now = Date.now()) {
  const r = createRankedRoom(record.participants,now);
  r.room.matchId = record.id;
  return {...r,next:planRankedJob(r.room,record.participants,now)};
}

export function advanceRanked(record, job, now = Date.now()) {
  if (record.version !== job.expected_version) throw Error('Stale ranked job');
  let r;
  if (job.payload.type === 'bot') {
    const p = record.participants.find(p => p.kind === 'bot' && p.seat === job.payload.seat);
    if (!p) throw Error('Unknown bot seat');
    // A queued bot move is revalidated by the same trusted rules as a human move.
    r = applyIntent(record.data,p.id,job.payload.command ? {command:job.payload.command}
      : {command:'action',action:job.payload.action},now);
  } else {
    r = applyIntent(record.data,record.participants[0].id,{command:'timeout'},now);
  }
  return {...r,next:planRankedJob(r.room,record.participants,now)};
}

export function applyRankedHuman(record, userId, input, now = Date.now(), previousJob = null) {
  // Claim once per opened turn/phase; repeated holds cannot extend it indefinitely.
  const seat = record.participants.find(p=>p.kind==='human' && p.user_id===userId);
  const claimKey = `${record.data.state.turn}:${record.data.state.phase}:${seat?.seat}`;
  const r = rankedHumanIntent(record.data,record.participants,userId,input,now);
  if (input.command === 'hold' && seat?.seat===record.data.state.active && !['memory','lastCall','finished'].includes(record.data.state.phase)) {
    if (record.data.ranked?.claimKey === claimKey) r.room.deadline=record.data.deadline;
    else r.room.ranked={...r.room.ranked,claimKey};
  }
  return {...r,next:planRankedJob(r.room,record.participants,now,previousJob)};
}
