import {type SupabaseClient, type RealtimeChannel} from '@supabase/supabase-js';
import {auth, currentSession, signInAsGuest, supabaseConfigured} from './account';
import {getSessionId} from './analytics';

const URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'';
const KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
export class MultiplayerService {
 client:SupabaseClient; room:any=null; channels:RealtimeChannel[]=[]; closed=false; version=-1; deadline:any; reconnecting=false; myTurn=false; holding=false; lastInput=0; lastRecover=0;
 onPacket:(packet:any)=>void; onConnection:(status:string)=>void; onPresence:(ids:string[])=>void;
 constructor(onPacket:(packet:any)=>void,onConnection:(status:string)=>void,onPresence:(ids:string[])=>void){
  if(!supabaseConfigured())throw Error('Online play is not configured yet.');
  this.client=auth();
  this.onPacket=onPacket;this.onConnection=onConnection;this.onPresence=onPresence;
  window.addEventListener('online',this.resume);document.addEventListener('visibilitychange',this.visibility);
  // Presence means the player actually did something, not merely that a tab is
  // open on a table nobody is sitting at.
  document.addEventListener('pointerdown',this.interact,{passive:true});document.addEventListener('keydown',this.interact);
 }
 async authenticate(){
  // A Google or guest session already exists by the time online play is reachable;
  // this only mints one if the player somehow arrived without it.
  const existing=await currentSession();
  if(existing)return existing;
  return (await signInAsGuest())!;
 }
 async request(command:string,extra:any={},retry=true):Promise<any>{
  const session=await this.authenticate();
  // `session` links a server-fired analytics event (room join, game start, a
  // rematch...) back to this tab's engagement session, so "games per session"
  // isn't limited to solo play, which is the only mode the client tracks directly.
  const body={command,roomId:this.room?.id,actionId:crypto.randomUUID(),session:getSessionId(),...extra};
  const call=async()=>{
   const response=await fetch(`${URL}/functions/v1/lotus-game`,{method:'POST',headers:{apikey:KEY,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
   const data: any=await response.json();if(data.packet)this.receive(data.packet);
   if(!response.ok)throw Object.assign(Error(data.error||'Could not reach the table.'),{status:response.status});return data;
  };
  try{return await call();}catch(error:any){
   if(error.status===401&&retry){await this.client.auth.signOut({scope:'local'}).catch(()=>{});return await this.request(command,extra,false);}
   if(!error.status&&retry){this.onConnection('Reconnecting…');return await call();}
   throw error;
  }
 }
 receive(packet:any){
  if(this.closed||!packet.room)return;
  const previous=this.version,sameRoom=this.room?.id===packet.room.id;
  if(sameRoom&&packet.room.version<=previous)return;
  if(sameRoom&&previous>=0&&packet.room.version>previous+1)packet={...packet,recover:true,events:[]};
  this.version=packet.room.version;this.room=packet.room;this.myTurn=packet.state?.active===0;
  this.onPacket(packet);this.scheduleDeadline();
 }
 unclaimed(){return !!this.room?.deadline&&this.room.deadline-this.room.serverTime<=8000;}
 claim(){
  if(this.holding||this.closed||typeof document==='undefined'||document.visibilityState!=='visible')return;
  this.holding=true;
  this.request('hold').then((packet:any)=>this.receive(packet)).catch(()=>{}).finally(()=>{this.holding=false;});
 }
 // A tap that is really a move must reach the server first: the move carries a
 // version and would lose a race with the claim. Waiting a beat lets the move
 // land, and the claim then buys thinking time for whatever it opened.
 interact=()=>{this.lastInput=Date.now();if(this.myTurn&&this.unclaimed())setTimeout(()=>{if(this.myTurn&&this.unclaimed())this.claim();},450);};
 scheduleDeadline(){
  clearTimeout(this.deadline);if(!this.room?.deadline||this.closed)return;
  // A turn opens on a short unclaimed window. Touching anything claims it and buys
  // the full turn to think; doing nothing at all lets it lapse, so the table moves
  // on instead of waiting out a player who is not there. Claiming lengthens the
  // deadline, so this cannot re-enter on its own response.
  if(this.myTurn&&this.unclaimed()&&Date.now()-this.lastInput<3000)this.claim();
  // Every client watches the same deadline, so stagger the nudge: whoever fires
  // first advances the room and the rest cancel on the broadcast that follows.
  // The stalled player is usually the active one, so they wait longest.
  const seat=Math.max(0,this.room.members.findIndex((m:any)=>m.id===this.room.me));
  const stagger=this.myTurn?6000:seat*1200;
  const delay=Math.max(500,this.room.deadline-this.room.serverTime+500+stagger);
  this.deadline=setTimeout(async()=>{if(this.closed)return;try{const packet=await this.request('timeout');this.receive(packet);}catch{await this.recover();}},delay);
 }
 async enter(command:'create'|'join'|'recover',extra:any={}){
  // A stale room id outranks the code on the server, so creating or joining must
  // forget the previous room before it asks for the next one.
  if(command!=='recover'){this.room=null;this.version=-1;}
  this.onConnection('Connecting…');const packet=await this.request(command,extra);
  this.room=packet.room;this.version=-1;
  localStorage.setItem('lotus-room',this.room.id);
  await this.subscribe();this.receive(packet);await this.recover();return packet;
 }
 async subscribe(){
  await Promise.all(this.channels.map(c=>this.client.removeChannel(c)));this.channels=[];
  const session=await this.authenticate();await this.client.realtime.setAuth(session.access_token);
  const room=this.room;
  const game=this.client.channel(`lotus:${room.id}:player:${room.me}`,{config:{private:true}});
  game.on('broadcast',{event:'sync'},({payload})=>this.receive(payload));
  const presence=this.client.channel(`lotus:${room.id}:presence`,{config:{private:true,presence:{key:room.me}}});
  presence.on('presence',{event:'sync'},()=>this.onPresence(Object.keys(presence.presenceState())));
  this.channels=[game,presence];
  await Promise.all(this.channels.map(channel=>new Promise<void>((resolve,reject)=>{
   let subscribed=false;
   const timer=setTimeout(()=>reject(Error('Could not join the private room. Try reconnecting.')),12000);
   channel.subscribe(async(status)=>{
    if(this.closed){clearTimeout(timer);return;}
    if(status==='SUBSCRIBED'){
     clearTimeout(timer);if(channel===presence)await presence.track({connected:true});
     this.onConnection('Connected');resolve();if(subscribed)await this.recover();subscribed=true;
    }else if(['CHANNEL_ERROR','TIMED_OUT','CLOSED'].includes(status)){this.onConnection('Reconnecting…');}
   });
  })));
 }
 async recover(){if(!this.room||this.closed)return;try{const packet=await this.request('recover');this.receive(packet);this.onConnection('Connected');}catch{this.onConnection('Reconnecting…');}}
 // Tab switching must not turn into an unbounded stream of edge invocations.
 resume=()=>{if(this.closed||this.reconnecting||!this.room||Date.now()-this.lastRecover<5000)return;this.lastRecover=Date.now();this.reconnecting=true;this.recover().finally(()=>{this.reconnecting=false;});};
 visibility=()=>{if(!document.hidden)this.resume();};
 async command(command:string,extra:any={}){const packet=await this.request(command,extra);this.receive(packet);return packet;}
 async action(action:any,version?:number){
  const seat=this.room.members.findIndex((m:any)=>m.id===this.room.me),n=this.room.members.length;
  const intent={...action};delete intent.player;delete intent.expectedCard;
  if(intent.target!==undefined)intent.target=(intent.target+seat)%n;
  return this.command('action',{action:intent,version:version??this.room.version});
 }
 async leave(){await this.request('leave');localStorage.removeItem('lotus-room');await this.close();}
 async close(){this.closed=true;clearTimeout(this.deadline);window.removeEventListener('online',this.resume);document.removeEventListener('visibilitychange',this.visibility);document.removeEventListener('pointerdown',this.interact);document.removeEventListener('keydown',this.interact);await Promise.all(this.channels.map(c=>this.client.removeChannel(c)));this.channels=[];}
}
