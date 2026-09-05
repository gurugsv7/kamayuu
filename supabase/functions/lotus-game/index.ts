import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {newRoom,applyIntent,playerPacket} from './multiplayer-rules.mjs';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return respond({error:'Use POST.'},405);
 try{
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return respond({error:'Sign in to play.'},401);
  const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  // verify_jwt=false is intentional: validate modern asymmetric Auth tokens with Auth itself.
  const {data:auth,error:authError}=await server.auth.getUser(token);
  if(authError||!auth.user)return respond({error:'Your guest session expired. Reconnect to play.'},401);
  const user=auth.user.id,raw=await req.text();if(raw.length>4096)return respond({error:'Request is too large.'},413);
  const input=JSON.parse(raw);
  const {error:limit}=await server.rpc('lotus_gate',{p_user:user});if(limit)return respond({error:limit.message},429);
  if(input.command==='create'){
   const data=newRoom(user,input.name);
   for(let n=0;n<4;n++){
    const bytes=crypto.getRandomValues(new Uint8Array(6)),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(bytes,x=>alphabet[x%32]).join('');
    const {data:record,error}=await server.rpc('lotus_create',{p_id:crypto.randomUUID(),p_code:code,p_data:data,p_user:user});
    if(!error)return respond(playerPacket(record,user));if(error.code!=='23505')throw Error(error.message);
   }
   throw Error('Could not allocate a room. Try again.');
  }
  for(let attempt=0;attempt<4;attempt++){
   const {data:record,error}=await server.rpc('lotus_load',{p_id:input.command==='join'?null:(input.roomId||null),p_code:String(input.code||'').trim().toUpperCase()||null});
   if(error)throw Error(error.message);if(!record)throw Error('Room not found. Check the code.');
   const member=record.data.members.some((m:any)=>m.id===user);
   if(input.command!=='join'&&!member)return respond({error:'You are not a member of this room.'},403);
   if(input.command==='recover')return respond(playerPacket(record,user,[],true));
   if(typeof input.actionId!=='string'||!/^[a-f0-9-]{36}$/i.test(input.actionId))throw Error('An action ID is required.');
   if(record.data.receipts.some((r:any)=>r.user===user&&r.id===input.actionId))return respond(playerPacket(record,user,[],true));
   if(input.command==='action'&&input.version!==record.version)return respond({error:'The table moved. Try again.',packet:playerPacket(record,user,[],true)},409);
   const {room,events}=applyIntent(record.data,user,input);
   room.receipts.push({user,id:input.actionId});room.receipts=room.receipts.slice(-128);
   const next={...record,data:room,version:record.version+1};
   // Realtime quota: a packet costs a send plus a delivery, so only send what is
   // actually new to someone else. The actor already has this packet as the HTTP
   // response, and a version gap is repaired client-side without a round trip.
   const was=record.data;
   const quiet=!events.length&&room.deadline===was.deadline&&room.host===was.host
    &&(room.state?.phase||null)===(was.state?.phase||null)
    &&JSON.stringify(room.members)===JSON.stringify(was.members);
   const packets=quiet?[]:room.members.filter((m:any)=>m.id!==user).map((m:any)=>({user_id:m.id,payload:playerPacket(next,m.id,events)}));
   const {data:committed,error:commitError}=await server.rpc('lotus_commit',{p_id:record.id,p_version:record.version,p_data:room,p_packets:packets});
   if(commitError)throw Error(commitError.message);
   if(committed)return respond(room.members.some((m:any)=>m.id===user)?playerPacket(next,user,events):{left:true});
  }
  return respond({error:'Another action just landed. Try again.'},409);
 }catch(error){return respond({error:error instanceof Error?error.message:'Unable to complete this action.'},400);}
});
