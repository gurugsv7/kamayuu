import {execFileSync} from 'node:child_process';
import {publicGameIntroHtml} from '../lib/public-game-info.mjs';

// Ship the source identity in both builds so web/native drift is inspectable.
export default function clientReleasePlugin(mode) {
  return {
    name: 'kamayuu-client-release',
    apply: 'build',
    transformIndexHtml(html) {
      if (mode === 'mobile') return html;
      const root = '<div id="root"></div>';
      if (!html.includes(root)) throw new Error('Homepage root missing: cannot prerender the public introduction.');
      // This is visible content, also rendered by FamilyGate after JavaScript runs.
      // It does not start an account, game, analytics session or age registration.
      return html.replace(root, `<div id="root"><main class="family-screen"><section class="family-card">${publicGameIntroHtml()}<noscript><p>Enable JavaScript to open the game. You can read the rules without it.</p></noscript></section></main></div>`);
    },
    generateBundle() {
      const sourceRevision = process.env.VERCEL_GIT_COMMIT_SHA ||
        execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
      this.emitFile({type: 'asset', fileName: 'client-release.json', source: JSON.stringify({
        sourceRevision,
        target: mode === 'mobile' ? 'mobile' : 'web',
      }, null, 2)});
    },
  };
}
