import test from 'node:test';
import assert from 'node:assert/strict';
import {TIERS, BOT_PROFILES, tierForRating, ratingWindow, ratingChange, selectBotProfile, botMatchConfig} from '../lib/ranked-config.mjs';
import {createRankedRoom, rankedHumanIntent, rankedHumanPacket} from '../lib/ranked-room.mjs';
import {BOT_IDENTITIES} from '../lib/ranked-roster.mjs';

test('tier boundaries are contiguous, stable, and independent of labels', () => {
  assert.equal(tierForRating(899).id, 'bronze');
  assert.equal(tierForRating(900).id, 'silver');
  assert.equal(tierForRating(4000).id, 'diamond');
  for (const t of TIERS) assert.equal(tierForRating(t.floor).id, t.id);
  for (const v of [-1, NaN, Infinity, 4001]) assert.throws(() => tierForRating(v));
  assert.throws(() => { TIERS[0].label = 'Changed'; });
});

test('early progression tapers toward Diamond with no opponent-type penalty', () => {
  for(const [rating,win,loss] of [[600,35,-9],[900,31,-12],[1200,27,-15],[1500,23,-18],[1800,16,-16]]) {
    for(const kind of ['human','bot']) {
      assert.equal(ratingChange(rating,rating,1,kind),win);
      assert.equal(ratingChange(rating,rating,0,kind),loss);
    }
  }
  assert.equal(ratingChange(1200, 1200, 0.5), 0);
  assert.ok(ratingChange(600,0,1,'bot')>=30);
  assert.ok(ratingChange(600,1200,1)>ratingChange(600,0,1));
  assert.equal(ratingChange(0, 0, 0), 0);
  assert.equal(ratingChange(4000, 4000, 1), 0);
  assert.throws(() => ratingChange(600, 600, 2));
});

test('human compatibility widens without tier-specific queues', () => {
  assert.deepEqual([0, 999, 1000, 1999, 2000].map(ratingWindow), [150, 150, 250, 250, 350]);
});

test('each tier has three distinct, frozen bot profiles; avoid immediate repeats', () => {
  assert.equal(BOT_PROFILES.length, 15);
  for (const tier of TIERS) {
    const roster = BOT_PROFILES.filter(p => p.tierId === tier.id);
    assert.equal(new Set(roster.map(p => p.styleId)).size, 3);
    const a = selectBotProfile(tier.floor, 0);
    assert.notEqual(selectBotProfile(tier.floor, 0, a.id).id, a.id);
    const config = botMatchConfig({...a, recall: 0}, 42);
    assert.equal(config.recall, a.recall);
    assert.equal(config.seed, 42);
    assert.throws(() => { config.rating = 0; });
  }
});

test('180 fictional rivals have unique display-safe names and balanced stable tier/style assignments',()=>{
  assert.equal(BOT_IDENTITIES.length,180);
  assert.equal(new Set(BOT_IDENTITIES.map(p=>p.id)).size,180);
  assert.equal(new Set(BOT_IDENTITIES.map(p=>p.name)).size,180);
  for(const p of BOT_IDENTITIES) {
    assert.ok(p.name.length<=16 && /^[A-Za-z0-9_.]+$/.test(p.name));
    assert.ok(BOT_PROFILES.some(profile=>profile.id===p.profileId));
    assert.ok(Object.isFrozen(p));
  }
  for(const profile of BOT_PROFILES) assert.equal(BOT_IDENTITIES.filter(p=>p.profileId===profile.id).length,12);
});

const participants = [
  {id: 'seat-a', seat: 0, kind: 'human', user_id: 'user-a', name: 'A'},
  {id: 'seat-b', seat: 1, kind: 'bot', user_id: null, bot_config: botMatchConfig(BOT_PROFILES[0], 42)},
];

test('ranked room uses separate seat IDs without exposing bot policy or hidden cards', () => {
  const {room, events} = createRankedRoom(participants, 0);
  assert.equal(room.members.length, 2);
  const packet = rankedHumanPacket({id: 'match', code: null, version: 1, data: room}, participants, 'user-a', events);
  assert.equal(packet.room.me, 'seat-a');
  assert.equal(packet.state.players[1].slots[2].rank, undefined);
  assert.equal(packet.state.deck, undefined);
  assert.equal(JSON.stringify(packet).includes('bot_config'), false);
  assert.throws(() => rankedHumanIntent(room, participants, 'seat-b', {command: 'remember'}, 1));
  assert.throws(() => rankedHumanIntent(room, participants, 'user-a', {command: 'join'}, 1));
  const next = rankedHumanIntent(room, participants, 'user-a', {command: 'remember'}, 1);
  assert.deepEqual(next.room.memorySeen, ['seat-a']);
  assert.throws(() => createRankedRoom([participants[0], {...participants[0], id: 'other', seat: 1}]));
});
