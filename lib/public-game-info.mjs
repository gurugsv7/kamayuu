// Shared between the first-visit screen and its build-time HTML fallback.
export const publicGameInfo = {
  title: 'Kamayuu — a free online card game',
  description: 'A game of memory, position tracking and nerve. Keep four cards face down, remember what sits where, and draw, swap or match discards to lower your total. Buzz when you think you have the lowest hand.',
  modes: 'Play Practice solo against 1–3 AI opponents, invite friends to a Private Table, or enter Ranked 1v1. Ranked opponents can include AI-controlled rivals, disclosed before play. No download is needed to play in your browser.',
  links: [
    {href: '/how-to-play', label: 'How to play Kamayuu'},
    {href: '/credits', label: 'Created by BuiltbyGSV'},
  ],
};

const escapeHtml = value => value.replace(/[&<>"']/g, ch => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[ch]));
export function publicGameIntroHtml() {
  const {title, description, modes, links} = publicGameInfo;
  return `<div class="public-game-intro"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><p>${escapeHtml(modes)}</p><nav class="public-game-links" aria-label="About Kamayuu">${links.map(link => `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`).join(' · ')}</nav></div>`;
}
