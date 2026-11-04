import {readFileSync, writeFileSync} from 'node:fs';
import {TIERS, BOT_PROFILES} from '../lib/ranked-config.mjs';
export const SEED_MARKER = '-- Generated roster: node scripts/ranked-seed.mjs';
const quote = x => `'${String(x).replaceAll("'", "''")}'`;
export function rosterSql() {
  return `${SEED_MARKER}\ninsert into lotus_ranked.tiers(id,label,floor,bot_rating) values\n${TIERS.map(t => ` (${quote(t.id)},${quote(t.label)},${t.floor},${t.botRating})`).join(',\n')};\n` +
    `insert into lotus_ranked.bot_profiles(id,tier_id,version,rating,config) values\n${BOT_PROFILES.map(p => ` (${quote(p.id)},${quote(p.tierId)},${p.version},${p.rating},${quote(JSON.stringify(p))}::jsonb)`).join(',\n')};\n`;
}
if (process.argv[1]?.endsWith('ranked-seed.mjs')) {
  const file = 'supabase/migrations/20261104043814_ranked_infrastructure.sql';
  const source = readFileSync(file, 'utf8').split(SEED_MARKER)[0].trimEnd();
  writeFileSync(file, `${source}\n\n${rosterSql()}`);
}
