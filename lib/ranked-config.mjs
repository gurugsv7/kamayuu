// Versioned ladder rules. IDs persist even when display names change.
export const LADDER_VERSION = 1;
export const DISCLOSURE_VERSION = 'ranked-ai-v1';
export const RANKED_DISCLOSURE = 'Ranked matchmaking prioritizes players and may use AI-controlled opponents when needed. Both count toward your rank.';
export const INITIAL_RATING = 600;
export const MAX_RATING = 4000;
export const TIERS = Object.freeze([
  {id: 'bronze', label: 'Bronze', floor: 0, botRating: 650},
  {id: 'silver', label: 'Silver', floor: 900, botRating: 1050},
  {id: 'gold', label: 'Gold', floor: 1200, botRating: 1350},
  {id: 'platinum', label: 'Platinum', floor: 1500, botRating: 1650},
  {id: 'diamond', label: 'Diamond', floor: 1800, botRating: 1950},
].map(Object.freeze));

export function tierForRating(rating) {
  if (!Number.isFinite(rating) || rating < 0 || rating > MAX_RATING) throw Error('Invalid rating');
  return TIERS.findLast(t => rating >= t.floor);
}

export function ratingWindow(waitMs) {
  if (!Number.isFinite(waitMs) || waitMs < 0) throw Error('Invalid queue wait');
  return waitMs >= 10000 ? 350 : waitMs >= 5000 ? 250 : 150;
}

export function ratingChange(rating, opponentRating, score, kind = 'human') {
  tierForRating(rating); tierForRating(opponentRating);
  if (![0, 0.5, 1].includes(score) || !['human', 'bot'].includes(kind)) throw Error('Invalid result');
  const expected = 1 / (1 + 10 ** ((opponentRating - rating) / 400));
  const amount = 32 * (kind === 'bot' ? 0.5 : 1) * (score - expected);
  // Explicit symmetric rounding, shared with PostgreSQL numeric round().
  const delta = Math.sign(amount) * Math.floor(Math.abs(amount) + 0.5);
  return Math.max(0, Math.min(MAX_RATING, rating + delta)) - rating;
}

const STYLES = Object.freeze([
  Object.freeze({id: 'patient', aggression: 0.2, buzzOffset: -2, replaceMargin: 1.3, delayScale: 1.15}),
  Object.freeze({id: 'opportunist', aggression: 0.8, buzzOffset: 1, replaceMargin: 0.4, delayScale: 0.9}),
  Object.freeze({id: 'tracker', aggression: 0.4, buzzOffset: 0, replaceMargin: 0.8, delayScale: 1}),
]);

export const BOT_PROFILES = Object.freeze(TIERS.flatMap((tier, i) => STYLES.map(style => Object.freeze({
  ...style, id: `${tier.id}-${style.id}-v1`, version: 1, tierId: tier.id,
  // Provisional calibration anchors, not claims of measured human strength.
  rating: tier.botRating, styleId: style.id,
  recall: [0.7, 0.8, 0.9, 0.96, 0.99][i],
  reactionChance: [0.5, 0.65, 0.8, 0.9, 0.97][i],
  reactionMinMs: [1800, 1400, 1100, 900, 750][i],
  reactionMaxMs: [3000, 2500, 2000, 1600, 1300][i],
}))));

export function selectBotProfile(rating, entropy, previousProfileId = null) {
  const tier = tierForRating(rating);
  if (!Number.isInteger(entropy) || entropy < 0) throw Error('Invalid bot selection entropy');
  const profiles = BOT_PROFILES.filter(p => p.tierId === tier.id && p.id !== previousProfileId);
  return profiles[entropy % profiles.length];
}

export function botMatchConfig(profile, seed) {
  if (!BOT_PROFILES.some(p => p.id === profile?.id && p.version === profile.version) ||
      !Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw Error('Invalid bot configuration');
  // Resolve from the trusted roster, not from caller-supplied strength fields.
  return Object.freeze({...BOT_PROFILES.find(p => p.id === profile.id), seed});
}
