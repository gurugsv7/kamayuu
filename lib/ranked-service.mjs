import {rankedHumanPacket} from './ranked-room.mjs';
import {applyRankedHuman} from './ranked-runtime.mjs';
import {rematchPersonality} from './rival-personality.mjs';

export class RankedError extends Error {
  constructor(message,status=400) {super(message);this.status=status;}
}

// Caller supplies verified auth identity and a service-only RPC transport.
// No user ID, rating, bot profile, or winner from a request is trusted.
export async function handleRanked(rpc, userId, input, now = Date.now()) {
  if (!userId) throw new RankedError('Sign in to play.',401);
  const status = () => rpc('ranked_status',{p_user:userId});
  if (input.command === 'status') return status();
  if (input.command === 'leaderboard') {
    if(input.search!==undefined && (typeof input.search!=='string'||input.search.length>40))throw new RankedError('Search must be 40 characters or fewer.');
    const search=(input.search??'').trim();
    return rpc(search?'ranked_search_leaderboard':'ranked_leaderboard',{
      p_user:userId,...(search?{p_search:search}:{}),p_limit:50,p_offset:input.offset??0});
  }
  if (input.command === 'acknowledge') {
    await rpc('ranked_acknowledge',{p_user:userId,p_version:input.version});
    return status();
  }
  if (input.command === 'enqueue') return rpc('ranked_enqueue',{p_user:userId,p_region:input.region});
  if (input.command === 'cancel') return rpc('ranked_cancel_queue',{p_user:userId});
  if (input.command === 'preferences') {
    if(typeof input.allowRematches!=='boolean')throw new RankedError('Invalid preference');
    await rpc('ranked_preferences',{p_user:userId,p_allow:input.allowRematches});return {ok:true};
  }
  if (!['recover','remember','hold','presented','action','leave','emote','message','rematch'].includes(input.command)) throw new RankedError('Unsupported ranked command');
  if (typeof input.matchId !== 'string') throw new RankedError('Match ID is required');
  for(let attempt=0;attempt<4;attempt++) {
    const record = await rpc('ranked_load_match',{p_match:input.matchId});
    if (!record || !record.participants.some(p=>p.kind==='human' && p.user_id===userId)) throw new RankedError('Match not found.',404);
    if (!record.data) return {pending:true,matchId:record.id};
    const packet = () => rankedHumanPacket({...record,code:null},record.participants,userId,[],true);
    if(record.status==='finished') {
      await rpc('ranked_prepare_rematch',{p_match:record.id,p_plan:rematchPersonality(record)});
      const rematch=await rpc('ranked_rematch',{p_user:userId,p_match:record.id,p_command:input.command==='rematch'?input.response||'request':'status'});
      if(input.command==='recover'||input.command==='rematch')return {packet:packet(),rematch,nextMatchId:rematch.nextMatchId};
    }
    if(input.command==='rematch')throw new RankedError('Finish this match first.',409);
    if (input.command==='recover') {
      const sequential=input.sinceVersion===record.version-1;
      return {packet:rankedHumanPacket({...record,code:null},record.participants,userId,sequential?record.data.ranked?.lastEvents||[]:[],!sequential)};
    }
    if (record.status!=='playing') throw new RankedError('This match has ended.',409);
    if (typeof input.actionId!=='string' || !/^[a-f0-9-]{36}$/i.test(input.actionId)) throw new RankedError('Action ID is required');
    if (record.data.receipts.some(r=>r.user===userId && r.id===input.actionId)) return {packet:packet()};
    if (input.command==='action' && input.version!==record.version) return {conflict:true,packet:packet()};
    const previous=await rpc('ranked_next_job',{p_match:record.id});
    const previousJob=previous ? {due:Date.parse(previous.due_at),payload:previous.payload} : null;
    const result=applyRankedHuman(record,userId,input,now,previousJob);
    result.room.receipts.push({user:userId,id:input.actionId});
    result.room.receipts=result.room.receipts.slice(-128);
    const committed=await rpc('ranked_commit',{
      p_match:record.id,p_version:record.version,p_data:result.room,
      p_due:result.next.due===null ? null : new Date(result.next.due).toISOString(),p_payload:result.next.payload,
    });
    if (committed) {
      if(result.room.state.phase==='finished')await rpc('ranked_prepare_rematch',{p_match:record.id,p_plan:rematchPersonality({...record,data:result.room})});
      return {packet:rankedHumanPacket({...record,code:null,version:record.version+1,data:result.room},record.participants,userId,result.events)};
    }
  }
  throw new RankedError('Another move just landed. Recover and try again.',409);
}
