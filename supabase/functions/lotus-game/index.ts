import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {newRoom,applyIntent,playerPacket} from './multiplayer-rules.mjs';

const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
// Fire-and-forget: analytics must never slow down or fail a real gameplay response.
// Registered with EdgeRuntime.waitUntil so the isolate isn't retired as merely
// "idle" the instant the response goes out — with no pending waitUntil work, the
// response being sent is itself enough for the runtime to consider the worker
// done and tear it down before this call ever reaches the database.
function track(server:any,user:string,event:string|null,extra:{session?:string;room?:string;mode?:string;players?:number;meta?:unknown}={}){
 const p=server.rpc('lotus_track',{p_user:user,p_event:event,p_session:extra.session||null,p_room:extra.room||null,p_mode:extra.mode||null,p_players:extra.players??null,p_meta:extra.meta||{}}).then(()=>{},()=>{});
 if(typeof EdgeRuntime!=='undefined')EdgeRuntime.waitUntil(p);
}
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
  if(input.command==='track'){
   // Client-driven analytics only: the session heartbeat, and solo game_start/
   // game_end, since solo play never otherwise reaches the server at all. Every
   // other lifecycle event (room create/join, online game_start/game_end,
   // rematch, abandonment) is logged below, from the server's own authoritative
   // view of what actually happened.
   track(server,user,input.event||null,{session:input.session,room:input.room,mode:input.mode,players:input.players,meta:input.meta});
   return respond({ok:true});
  }
  if(input.command==='create'){
   const data=newRoom(user,input.name);
   for(let n=0;n<4;n++){
    const bytes=crypto.getRandomValues(new Uint8Array(6)),alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',code=Array.from(bytes,x=>alphabet[x%32]).join('');
    const {data:record,error}=await server.rpc('lotus_create',{p_id:crypto.randomUUID(),p_code:code,p_data:data,p_user:user});
    if(!error){track(server,user,'room_create',{session:input.session,room:code,mode:'online'});return respond(playerPacket(record,user));}
    if(error.code!=='23505')throw Error(error.message);
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
   if(committed){
    // Server-authoritative lifecycle events. `input.command` is what the acting
    // player asked for; a departure discovered here (an AFK timeout removing an
    // idle player) is attributed to that departed player, not whoever's request
    // happened to trigger the sweep — they're the only reliable witness, since a
    // client that's gone silent can never self-report its own abandonment.
    const players=room.members.length;
    if(input.command==='join')track(server,user,'room_join',{session:input.session,room:record.code,mode:'online'});
    else if(input.command==='start')track(server,user,'game_start',{session:input.session,room:record.code,mode:'online',players});
    else if(input.command==='rematch')track(server,user,'rematch',{session:input.session,room:record.code,mode:'online',players});
    else if(input.command==='leave')track(server,user,'room_leave',{session:input.session,room:record.code,mode:'online'});
    else if(input.command==='timeout'){
     const newlyDeparted=(room.departed||[]).filter((id:string)=>!(was.departed||[]).includes(id));
     for(const id of newlyDeparted)track(server,id,'room_abandon',{room:record.code,mode:'online',players});
    }
    if(was.state?.phase!=='finished'&&room.state?.phase==='finished')track(server,user,'game_end',{session:input.session,room:record.code,mode:'online',players});
    return respond(room.members.some((m:any)=>m.id===user)?playerPacket(next,user,events):{left:true});
   }
  }
  return respond({error:'Another action just landed. Try again.'},409);
 }catch(error){return respond({error:error instanceof Error?error.message:'Unable to complete this action.'},400);}
});
