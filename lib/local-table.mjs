// Development harness only. Runs the real multiplayer rules in the browser so online
// mode can be exercised without a deployed Supabase project. It presents the same
// surface as MultiplayerService, and is loaded lazily from the dev-only QA hook.
import {newRoom, applyIntent, playerPacket} from './multiplayer-rules.mjs';
import {aiView, chooseAction, chooseReaction} from './engine.mjs';

export class LocalTable {
 constructor(seats, onPacket, onConnection, onPresence, names = []) {
  this.seats = seats; this.onPacket = onPacket; this.onConnection = onConnection; this.onPresence = onPresence;
  this.users = Array.from({length: seats}, (_, i) => `local-${i}`);
  this.record = {id: 'local-room', code: 'LOCAL1', version: 0, data: newRoom(this.users[0], names[0] || 'You')};
  for (let i = 1; i < seats; i++) this.commit(this.users[i], {command: 'join', name: names[i] || `Seat ${i}`});
  this.closed = false;
 }
 get room() { return playerPacket(this.record, this.users[0]).room; }
 commit(user, input, now = Date.now()) {
  const r = applyIntent(this.record.data, user, input, now);
  this.record = {...this.record, data: r.room, version: this.record.version + 1};
  return r.events;
 }
 emit(events) { if (!this.closed) this.onPacket(playerPacket(this.record, this.users[0], events)); }
 async enter() { this.onConnection('Connected'); this.onPresence(this.users); this.emit([]); await this.bots(); }
 async command(command, extra = {}) { this.emit(this.commit(this.users[0], {command, ...extra})); await this.bots(); }
 async action(action) {
  const intent = {...action}; delete intent.player; delete intent.expectedCard;
  this.emit(this.commit(this.users[0], {command: 'action', action: intent}));
  await this.bots();
 }
 async leave() { this.closed = true; }
 async close() { this.closed = true; }
 async bots() {
  for (let guard = 0; guard < 600 && !this.closed; guard++) {
   const room = this.record.data, s = room.state;
   if (!s) { // Lobby: everyone else readies up so the host can start.
    const waiting = room.members.findIndex((m, i) => i > 0 && !m.ready);
    if (waiting < 0) return;
    this.commit(this.users[waiting], {command: 'ready', ready: true}); this.emit([]); continue;
   }
   if (s.phase === 'finished') return;
   if (s.phase === 'memory') {
    const waiting = room.members.findIndex((m, i) => i > 0 && !room.memorySeen.includes(m.id));
    if (waiting < 0) return;
    this.emit(this.commit(this.users[waiting], {command: 'remember'})); continue;
   }
   if (s.phase === 'lastCall') { // Only the deadline can end the last call.
    await this.pause(1200); if (this.closed) return;
    this.emit(this.commit(this.users[0], {command: 'timeout'}, room.deadline)); continue;
   }
   // An opponent may react to the discard out of turn.
   const reaction = room.members.findIndex((m, i) => i > 0 && !s.players[i].eliminated && chooseReaction(aiView(s, i)));
   if (reaction > 0) {
    await this.pause(900); if (this.closed) return;
    const live = this.record.data.state;
    if (live && live.phase !== 'finished') {
     const move = chooseReaction(aiView(live, reaction));
     if (move) { this.emit(this.commit(this.users[reaction], {command: 'action', action: move})); continue; }
    }
   }
   if (s.active === 0) return; // Seat zero is the person playing.
   await this.pause(750); if (this.closed) return;
   const live = this.record.data.state;
   if (!live || live.phase === 'finished' || live.active === 0 || live.phase === 'memory') continue;
   this.emit(this.commit(this.users[live.active], {command: 'action', action: chooseAction(aiView(live))}));
  }
 }
 pause(ms) { return new Promise(r => setTimeout(r, ms)); }
}
