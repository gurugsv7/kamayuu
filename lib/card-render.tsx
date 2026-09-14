// Shared card visuals: real playing-card SVGs, cached once and reused by every
// table on the page (the live game and the tutorial alike) so a card is a pure
// string lookup with zero network involved once warm. See app/page.tsx for how
// the main table wires this into its own imperative DOM updates.
import {memo} from 'react';
import {value} from '@/lib/engine.mjs';

export const SUIT_FILE: Record<string, string> = {'♠': 'S', '♥': 'H', '♣': 'C', '♦': 'D'};
export const RANK_FILE = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const cardSrc = (c: any) => `/cards/${c.rank === '10' ? 'T' : c.rank}${SUIT_FILE[c.suit]}.svg`;

export const cardArtCache = new Map<string, string>();
const CARD_RETRY =
  "var n=+(this.dataset.n||0);if(n<6){this.dataset.n=n+1;var s=this.getAttribute('src').split('?')[0];var self=this;setTimeout(function(){self.src=s+'?r='+Date.now();},500*(n+1));}";

export function cardHTML(c: any = null) {
  if (!c || !c.rank) return `<div class="playing-card back"></div>`;
  const code = (c.rank === '10' ? 'T' : c.rank) + SUIT_FILE[c.suit];
  const cached = cardArtCache.get(code);
  const art = cached
    ? `<span class="card-art card-art-inline">${cached}</span>`
    : `<img class="card-art" src="${cardSrc(c)}" alt="" draggable="false" onerror="${CARD_RETRY}">`;
  return `<div class="playing-card face ${['♥', '♦'].includes(c.suit) ? 'red' : ''}">${art}${value(c) === 0 ? '<em class="zero">ZERO</em>' : ''}</div>`;
}

export const Card = memo(function Card({card = null, empty = false, rev = 0}: any) {
  return <div key={rev} className="card-content" dangerouslySetInnerHTML={{__html: empty ? '' : cardHTML(card)}} />;
});

/** Fetches every card's real SVG markup into the shared cache. Safe to call from
 *  more than one table — already-cached codes are skipped, so a warm cache from
 *  the main game costs nothing when the tutorial calls this again defensively. */
export async function preloadCardArt() {
  const codes: string[] = [];
  for (const r of RANK_FILE) for (const u of ['S', 'H', 'C', 'D']) codes.push(r + u);
  await Promise.all(
    codes.map(async (code) => {
      if (cardArtCache.has(code)) return;
      try {
        const res = await fetch(`/cards/${code}.svg`);
        if (res.ok) cardArtCache.set(code, await res.text());
      } catch {}
    }),
  );
}
