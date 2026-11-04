import {currentSession} from './account';

export type RankedStatus = {
  enabled:boolean; season:string; disclosureVersion:string; disclosureText:string;
  needsDisclosure:boolean; rating:number; played:number; humanPlayed:number;
  tier:{id:string;label:string;floor:number};
  ticket:null|{id:string;status:'waiting'|'matched'|'cancelled'|'expired';match_id:string|null;expires_at:string};
  activeMatchId:string|null;
};

export type RankedStanding = {
  entry_id:string; name:string; kind:'human'|'bot'; rating_type:'competitive'|'benchmark';
  rating:number; played:number; wins:number; rank:number;
};
export type RankedLeaderboard = {season:string;entries:RankedStanding[];total:number;offset:number};
type RankedTableRoom={id:string;version:number;me:string;members:{id:string}[];[key:string]:unknown};
type RankedTableState={phase:string;active:number;turn:number;[key:string]:unknown};
type RankedPacket={room:RankedTableRoom;state:RankedTableState|null;events:unknown[];[key:string]:unknown};
type RankedResponse={packet?:RankedPacket;nextMatchId?:string|null;rematch?:Record<string,unknown>;pending?:boolean};

// Transport foundation; the ranked UI must show status.disclosureText before
// acknowledge(). Never silently acknowledge on behalf of a player.
export class RankedService {
  async request<T=Record<string,unknown>>(command:string,extra:Record<string,unknown>={}):Promise<T> {
    const session=await currentSession();
    if(!session)throw Error('Sign in to enter ranked.');
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if(!url || !key)throw Error('Ranked is not configured.');
    const body=JSON.stringify({command,...extra});
    const call=async()=>{
      const response=await fetch(`${url}/functions/v1/lotus-ranked`,{
        method:'POST',headers:{apikey:key,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},
        body,signal:AbortSignal.timeout(15000),
      });
      const result=await response.json() as T & {error?:string;packet?:unknown};
      if(!response.ok)throw Object.assign(Error(result.error || 'Recover the match and try again.'),{status:response.status,packet:result.packet});
      return result;
    };
    // The same body/action ID is retained across network retries.
    try{return await call();}catch(error:unknown){
      if(error instanceof Error && 'status' in error)throw error;
      return call();
    }
  }
  status():Promise<RankedStatus>{return this.request<RankedStatus>('status');}
  leaderboard(offset=0):Promise<RankedLeaderboard>{return this.request<RankedLeaderboard>('leaderboard',{offset});}
  acknowledge(version:string):Promise<RankedStatus>{return this.request<RankedStatus>('acknowledge',{version});}
  enqueue(region='ap-south-1'):Promise<RankedStatus>{return this.request<RankedStatus>('enqueue',{region});}
  cancel():Promise<RankedStatus>{return this.request<RankedStatus>('cancel');}
  recover(matchId:string,sinceVersion=-1){return this.request<RankedResponse>('recover',{matchId,sinceVersion});}
  preferences(allowRematches:boolean){return this.request('preferences',{allowRematches});}
  command(matchId:string,command:string,extra:Record<string,unknown>={}) {
    return this.request<RankedResponse>(command,{...extra,matchId,actionId:crypto.randomUUID()});
  }
}

// Same table surface as MultiplayerService. Serialized HTTP recovery preserves
// server authority; settings/dialogs never pause the server's opponent clock.
export class RankedTable {
  client=new RankedService();room:RankedTableRoom|null=null;version=-1;closed=false;matchId:string;timer:ReturnType<typeof setTimeout>|undefined;
  pollBusy=false;lastHoldKey='';
  holdTimer:ReturnType<typeof setTimeout>|undefined;
  constructor(matchId:string,public onPacket:(p:RankedPacket)=>void,public onConnection:(s:string)=>void,public onPresence:(ids:string[])=>void){this.matchId=matchId;}
  async enter(){
    window.addEventListener('online',this.resume);document.addEventListener('visibilitychange',this.resume);
    document.addEventListener('pointerdown',this.interact);document.addEventListener('keydown',this.interact);
    await this.recover();this.schedule();
  }
  receive(result:RankedResponse){
    if(this.closed)return;
    if(result.nextMatchId && result.nextMatchId!==this.matchId){this.matchId=result.nextMatchId;this.version=-1;this.lastHoldKey='';return;}
    const p=result.packet;if(!p)return;
    if(p.room.id!==this.matchId)return;
    if(this.room?.id===p.room.id && p.room.version<this.version)return;
    const unchanged=this.room?.id===p.room.id && p.room.version===this.version;
    this.lastState=p.state;
    this.room={...p.room,rematch:result.rematch||null};this.version=p.room.version;
    this.onPacket({...p,room:this.room,metaOnly:unchanged});this.onConnection('Connected');
    // Presence represents connected humans only, never fictitious bot activity.
    this.onPresence([p.room.me]);
  }
  schedule(){clearTimeout(this.timer);if(!this.closed)this.timer=setTimeout(async()=>{await this.recover();this.schedule();},2000);}
  async recover(){if(this.closed||this.pollBusy)return;this.pollBusy=true;try{this.receive(await this.client.recover(this.matchId,this.version));}catch{this.onConnection('Reconnecting…');}finally{this.pollBusy=false;}}
  resume=()=>{if(!document.hidden)void this.recover();};
  interact=()=>{
    if(this.closed||!this.room||!this.lastState||this.lastState.active!==0||['memory','finished','lastCall'].includes(this.lastState.phase))return;
    const key=`${this.matchId}:${this.lastState.turn}:${this.lastState.phase}`;
    if(this.lastHoldKey===key)return;this.lastHoldKey=key;
    const version=this.version;
    clearTimeout(this.holdTimer);this.holdTimer=setTimeout(()=>{
      if(this.closed||this.version!==version){this.lastHoldKey='';return;}
      void this.command('hold').catch(()=>{this.lastHoldKey='';});
    },450);
  };
  lastState:RankedTableState|null=null;
  async command(command:string,extra:Record<string,unknown>={}){
    if(command==='preferences')return this.client.preferences(extra.allowRematches!==false);
    const response=await this.client.command(this.matchId,command,extra);
    this.receive(response);return response;
  }
  async action(action:{type:string;target?:number;player?:number;expectedCard?:string;[key:string]:unknown}){
    if(!this.room)throw Error('The match is still connecting.');
    const room=this.room,seat=room.members.findIndex(m=>m.id===room.me);
    const intent={...action};delete intent.player;delete intent.expectedCard;
    if(intent.target!==undefined)intent.target=(intent.target+seat)%2;
    try{return await this.command('action',{action:intent,version:this.version});}
    catch(error:unknown){if(error instanceof Error&&'packet' in error&&error.packet)this.receive({packet:error.packet as RankedPacket});throw error;}
  }
  async leave(){try{if(this.lastState?.phase!=='finished')await this.command('leave');else await this.command('rematch',{response:'decline'});}finally{await this.close();}}
  async close(){this.closed=true;clearTimeout(this.timer);clearTimeout(this.holdTimer);window.removeEventListener('online',this.resume);document.removeEventListener('visibilitychange',this.resume);document.removeEventListener('pointerdown',this.interact);document.removeEventListener('keydown',this.interact);}
}
