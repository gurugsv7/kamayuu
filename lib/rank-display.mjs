import {TIERS, tierForRating} from './ranked-config.mjs';
/** @typedef {{id:string,label:string,floor:number,botRating:number}} DisplayTier */
/** @type {readonly DisplayTier[]} */
export const RANK_TIERS = TIERS;

// Use the same thresholds as matchmaking, including the open-ended top tier.
export function rankProgress(rating) {
  const tier = /** @type {DisplayTier} */ (tierForRating(rating));
  const next = RANK_TIERS[RANK_TIERS.indexOf(tier) + 1] || null;
  return {tier, next, remaining: next ? next.floor - rating : 0,
    fraction: next ? (rating - tier.floor) / (next.floor - tier.floor) : 1};
}
