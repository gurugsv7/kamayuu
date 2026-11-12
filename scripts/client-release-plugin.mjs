import {execFileSync} from 'node:child_process';

// Ship the source identity in both builds so web/native drift is inspectable.
export default function clientReleasePlugin(mode) {
  return {
    name: 'kamayuu-client-release',
    apply: 'build',
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
