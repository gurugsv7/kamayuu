import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {handleRanked} from './ranked-service.mjs';
import {familyGuard} from '../_shared/family.ts';
import {familyPacket} from '../_shared/family-policy.mjs';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
Deno.serve(async (req:Request)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers});
  if(req.method!=='POST')return respond({error:'Use POST.'},405);
  try {
    const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
    if(!token)return respond({error:'Sign in to play.'},401);
    const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await server.auth.getUser(token);
    if(error || !data.user)return respond({error:'Session expired. Sign in again.'},401);
    const raw=await req.text();if(raw.length>4096)return respond({error:'Request too large.'},413);
    const input=JSON.parse(raw);
    if(!input || typeof input!=='object' || Array.isArray(input))return respond({error:'Invalid request.'},400);
    const family=await familyGuard(server,data.user.id,input);
    const {error:limited}=await server.rpc('lotus_gate',{p_user:data.user.id});
    if(limited)return respond({error:'Too many requests. Please wait.'},429);
    const rpc=async(name:string,args:Record<string,unknown>)=>{
      if(name==='ranked_rematch'&&['request','accept'].includes(String(args.p_command))){
        const loaded=await server.rpc('ranked_load_match',{p_match:args.p_match});if(loaded.error)throw Error('Could not check rematch permissions.');
        for(const seat of loaded.data?.participants||[]){if(seat.kind==='human')await familyGuard(server,seat.user_id,{command:'rematch',response:'accept'});}
      }
      const {data:result,error:failure}=await server.rpc(name,args);
      if(failure)throw Object.assign(Error(failure.message),{status:failure.code==='22P02'?400:undefined});
      return result;
    };
    const result=await handleRanked(rpc,data.user.id,input);
    return respond(familyPacket(result,family),result.conflict?409:200);
  } catch(error:unknown) {
    const details=error instanceof Error ? error as Error & {status?:number} : null;
    return respond({error:details?.message || 'Unable to complete ranked request.'},details?.status || 400);
  }
});
