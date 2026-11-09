import {readFileSync,writeFileSync} from 'node:fs';
import {BOT_IDENTITIES} from '../lib/ranked-roster.mjs';
const file='supabase/migrations/20261109222213_shared_rival_standings.sql';
const marker='-- Stable rival handles';
const source=readFileSync(file,'utf8').split(marker)[0].trimEnd();
const quote=x=>`'${x.replaceAll("'","''")}'`;
writeFileSync(file,source+'\n\n'+marker+'\nupdate lotus_ranked.bot_identities i set name=v.name from (values\n'+BOT_IDENTITIES.map(p=>` (${quote(p.id)},${quote(p.name)})`).join(',\n')+'\n) as v(id,name) where i.id=v.id;\n');
