export const OPENING_ART = Object.freeze([
 '/brand/kamayuu-emblem.png',
 '/loaders/opening-scene.webp',
 '/loaders/kamayuu-wordmark.webp',
 '/loaders/opening-deal-v2-still.png',
 '/loaders/opening-deal-v2.webp',
]);
export const MATCHMAKING_ART = Object.freeze([
 '/loaders/matchmaking-table-v4-still.png',
 '/loaders/matchmaking-table-v4.webp',
]);

// Keep decoded image references for the lifetime of this page. A timeout or a
// missing image must never trap the player behind Android's native splash.
const images = new Map();
export function warmArtwork(paths, {ImageClass = globalThis.Image, timeoutMs = 1500} = {}) {
 if (!ImageClass) return Promise.resolve();
 return Promise.allSettled(paths.map(src => {
  if (images.has(src)) return images.get(src).ready;
  const image = new ImageClass();
  const ready = new Promise(resolve => {
   let settled = false;
   const finish = () => {
    if (settled) return;
    settled = true; clearTimeout(timer); image.onload = null; image.onerror = null; resolve();
   };
   const timer = setTimeout(finish, timeoutMs);
   image.onload = () => Promise.resolve().then(() => image.decode?.()).catch(() => {}).then(finish);
   image.onerror = finish;
   image.src = src;
  });
  images.set(src, {image, ready});
  return ready;
 }));
}
