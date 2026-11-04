import {rankedHumanPacket} from './ranked-room.mjs';
import {applyRankedHuman} from './ranked-runtime.mjs';

export class RankedError extends Error {
  constructor(message,status=400) {super(message);this.status=status;}
}

// Caller supplies verified auth identity and a service-only RPC transport.
// No user ID, rating, bot profile, or winner from a request is trusted.
export async function handleRanked(rpc, userId, input, now = Date.now()) {
  if (!userId) throw new RankedError('Sign in to play.',401);
  const status = () => rpc('ranked_status',{p_user:userId});
  if (input.command === 'status') return status();
  if (input.command === 'acknowledge') {
    await rpc('ranked_acknowledge',{p_user:userId,p_version:input.version});
    return status();
  }
  if (input.command === 'enqueue') return rpc('ranked_enqueue',{p_user:userId,p_region:input.region});
  if (input.command === 'cancel') return rpc('ranked_cancel_queue',{p_user:userId});
  if (!['recover','remember','hold','action','leave'].includes(input.command)) throw new RankedError('Unsupported ranked command');
  if (typeof input.matchId !== 'string') throw new RankedError('Match ID is required');
  for(let attempt=0;attempt<4;attempt++) {
    const record = await rpc('ranked_load_match',{p_match:input.matchId});
    if (!record || !record.participants.some(p=>p.kind==='human' && p.user_id===userId)) throw new RankedError('Match not found.',404);
    if (!record.data) return {pending:true,matchId:record.id};
    const packet = () => rankedHumanPacket({...record,code:null},record.participants,userId,[],true);
    if (input.command==='recover') return {packet:packet()};
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
    if (committed) return {packet:rankedHumanPacket({...record,code:null,version:record.version+1,data:result.room},record.participants,userId,result.events)};
  }
  throw new RankedError('Another move just landed. Recover and try again.',409);
}
