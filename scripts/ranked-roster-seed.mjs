import {readFileSync,writeFileSync} from 'node:fs';
import {BOT_IDENTITIES} from '../lib/ranked-roster.mjs';
export const IDENTITY_MARKER='-- Generated fictional rivals: node scripts/ranked-roster-seed.mjs';
const quote=x=>`'${String(x).replaceAll("'","''")}'`;
export function identityRosterSql() {
  return `${IDENTITY_MARKER}\ninsert into lotus_ranked.bot_identities(id,name,profile_id,seed) values\n`+
    BOT_IDENTITIES.map(p=>` (${quote(p.id)},${quote(p.name)},${quote(p.profileId)},${p.seed})`).join(',\n')+';\n';
}
if(process.argv[1]?.endsWith('ranked-roster-seed.mjs')) {
  const file='supabase/migrations/20261104045454_ranked_named_rivals_fast_queue.sql';
  const source=readFileSync(file,'utf8').split(IDENTITY_MARKER)[0].trimEnd();
  writeFileSync(file,`${source}\n\n${identityRosterSql()}`);
}
