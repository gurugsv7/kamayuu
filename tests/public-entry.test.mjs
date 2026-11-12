import test from 'node:test';
import assert from 'node:assert/strict';
import {publicGameInfo} from '../lib/public-game-info.mjs';
import clientReleasePlugin from '../scripts/client-release-plugin.mjs';

const html = '<html><body><div id="root"></div><script src="/game.js"></script></body></html>';
test('public homepage exposes useful content and real links without JavaScript or age selection', () => {
  const output = clientReleasePlugin('production').transformIndexHtml(html);
  const visible = output.replace(/<noscript>[\s\S]*?<\/noscript>/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, '');
  assert.ok(visible.includes(publicGameInfo.title));
  assert.ok(visible.includes(publicGameInfo.description));
  assert.ok(visible.includes(publicGameInfo.modes));
  assert.match(visible, /href="\/how-to-play"/);
  assert.match(visible, /href="\/credits"/);
  assert.doesNotMatch(visible, /display:\s*none|clip:|aria-hidden/);
});
test('mobile entry is preserved and a missing public root fails the web build', () => {
  assert.equal(clientReleasePlugin('mobile').transformIndexHtml(html), html);
  assert.throws(() => clientReleasePlugin('production').transformIndexHtml('<html></html>'), /root missing/);
});
