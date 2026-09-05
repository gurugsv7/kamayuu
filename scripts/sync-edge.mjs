import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync('supabase/functions/lotus-game',{recursive:true});
for(const file of ['engine.mjs','multiplayer-rules.mjs'])copyFileSync(`lib/${file}`,`supabase/functions/lotus-game/${file}`);
