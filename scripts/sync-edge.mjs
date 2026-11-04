import {copyFileSync,mkdirSync} from 'node:fs';
mkdirSync('supabase/functions/lotus-game',{recursive:true});
for(const file of ['engine.mjs','multiplayer-rules.mjs'])copyFileSync(`lib/${file}`,`supabase/functions/lotus-game/${file}`);
mkdirSync('supabase/functions/lotus-ranked',{recursive:true});
for(const file of ['engine.mjs','multiplayer-rules.mjs','ranked-config.mjs','ranked-room.mjs','ranked-runtime.mjs','ranked-service.mjs','rival-personality.mjs'])copyFileSync(`lib/${file}`,`supabase/functions/lotus-ranked/${file}`);
