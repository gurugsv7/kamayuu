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
  recover(matchId:string){return this.request('recover',{matchId});}
  command(matchId:string,command:'remember'|'hold'|'action'|'leave',extra:Record<string,unknown>={}) {
    return this.request(command,{...extra,matchId,actionId:crypto.randomUUID()});
  }
}
