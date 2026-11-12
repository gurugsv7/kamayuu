import {setTimeout} from 'node:timers/promises';
import {rankedTick} from '../lib/ranked-worker.mjs';

const url=process.env.SUPABASE_URL;
const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on the trusted worker host.');
const regions=(process.env.RANKED_REGIONS || 'ap-south-1').split(',');
const once=process.argv.includes('--once');
let stopped=false;
process.on('SIGINT',()=>{stopped=true;});process.on('SIGTERM',()=>{stopped=true;});
async function rpc(name,args) {
  const response=await fetch(`${url}/rest/v1/rpc/${name}`,{
    method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'},
    body:JSON.stringify(args),signal:AbortSignal.timeout(10000),
  });
  if (!response.ok) throw Error(`Ranked RPC failed (${response.status})`);
  const text=await response.text();return text ? JSON.parse(text) : null;
}
do {
  try {
    const result=await rankedTick(rpc,regions);
    if(once || result.paired || result.processed)console.log(JSON.stringify(result));
  }
  catch {console.error('Ranked worker tick failed; retrying.');if(once)process.exitCode=1;}
  if (!once && !stopped) await setTimeout(250);
} while(!once && !stopped);
