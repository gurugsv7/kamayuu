// Trusted adapter only. Public packets must still pass through playerPacket.
import {newRoom, applyIntent, playerPacket} from './multiplayer-rules.mjs';
import {transition} from './engine.mjs';
import {EMOTES,QUICK_MESSAGES} from './rival-personality.mjs';

export function createRankedRoom(participants, now = Date.now()) {
  if (participants.length !== 2 || participants[0].seat !== 0 || participants[1].seat !== 1 ||
      new Set(participants.map(p => p.id)).size !== 2 ||
      participants.some(p => !p.id || !['human', 'bot'].includes(p.kind) ||
        (p.kind === 'human' ? !p.user_id : p.user_id != null || !p.bot_config))) throw Error('Invalid ranked seats');
  const humans = participants.filter(p => p.kind === 'human');
  if (!humans.length || new Set(humans.map(p => p.user_id)).size !== humans.length) throw Error('Invalid human seats');
  const first = participants[0];
  let room = newRoom(first.id, first.name || 'Challenger', now);
  room = applyIntent(room, participants[1].id, {command: 'join', name: participants[1].name || 'Challenger'}, now).room;
  for (const p of participants) room = applyIntent(room, p.id, {command: 'ready', ready: true}, now).room;
  const result = applyIntent(room, first.id, {command: 'start'}, now);
  // The secure deal already randomizes cards; randomize opening seat as well.
  result.room.state.active = crypto.getRandomValues(new Uint8Array(1))[0] % 2;
  result.room.ranked = {version: 1};
  // Store no bot configuration in members: playerPacket exposes member metadata.
  return result;
}

export function rankedHumanIntent(room, participants, userId, input, now = Date.now()) {
  const participant = participants.find(p => p.kind === 'human' && p.user_id === userId);
  if (!participant) throw Error('You are not a player in this match.');
  if (!['remember', 'hold', 'presented', 'action', 'leave', 'timeout','emote','message'].includes(input.command)) throw Error('Unsupported ranked command');
  if(input.command==='emote' && !EMOTES.includes(input.name) || input.command==='message' && !QUICK_MESSAGES.includes(input.text))throw Error('Unknown reaction');
  if(['emote','message'].includes(input.command)) {
    const last=room.ranked?.socialFeed?.findLast(e=>e.p===participant.seat);
    if(last && now-last.at<2500)throw Error('Wait a moment before reacting again.');
  }
  if (input.command==='leave' && room.state?.phase==='memory') {
    const next=structuredClone(room);
    const remembered=transition(next.state,{type:'remember'});
    next.state=remembered.state;
    const result=applyIntent(next,participant.id,input,now);
    return {...result,events:[...remembered.events,...result.events]};
  }
  return applyIntent(room, participant.id, input, now);
}

export function rankedHumanPacket(record, participants, userId, events = [], recover = false) {
  const participant = participants.find(p => p.kind === 'human' && p.user_id === userId);
  if (!participant) throw Error('You are not a player in this match.');
  const packet=playerPacket(record, participant.id, events, recover);
  packet.room.mode='ranked';
  packet.social=(record.data.ranked?.socialFeed||[]).map(e=>({...e,p:(e.p-participant.seat+2)%2}));
  return packet;
}
