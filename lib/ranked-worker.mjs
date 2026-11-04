import {bootstrapRanked, advanceRanked} from './ranked-runtime.mjs';
import {rematchPersonality} from './rival-personality.mjs';

export async function processRankedJob(rpc, job, now = Date.now()) {
  const record = await rpc('ranked_load_match',{p_match:job.match_id});
  if (!record || !['allocated','playing'].includes(record.status) || record.version!==job.expected_version) return false;
  const result = job.kind==='bootstrap' ? bootstrapRanked(record,now) : advanceRanked(record,job,now);
  const committed=await rpc('ranked_commit',{
    p_match:record.id,p_version:record.version,p_data:result.room,
    p_due:result.next.due===null ? null : new Date(result.next.due).toISOString(),p_payload:result.next.payload,
    p_job:job.id,p_token:job.claim_token,
  });
  if(committed&&result.room.state.phase==='finished')await rpc('ranked_prepare_rematch',{p_match:record.id,p_plan:rematchPersonality({...record,data:result.room})});
  return committed;
}

export async function rankedTick(rpc, regions=['ap-south-1']) {
  let paired=0,processed=0;
  for (const region of regions) {
    // Bounded batches keep cancellation and newly-arriving humans responsive.
    for(let i=0;i<16;i++) {
      if (!await rpc('ranked_pair',{p_region:region})) break;
      paired++;
    }
  }
  for(let i=0;i<32;i++) {
    const job=await rpc('ranked_claim_job',{});
    if (!job) break;
    try {
      const committed=await processRankedJob(rpc,job);
      if (!committed) await rpc('ranked_discard_job',{p_job:job.id,p_token:job.claim_token});
    } catch {
      // Do not persist raw errors: transports can include secrets or card data.
      const released=await rpc('ranked_release_job',{p_job:job.id,p_token:job.claim_token,p_error:'Ranked job failed'});
      if (released && job.attempts>=5) await rpc('ranked_abort',{p_match:job.match_id});
    }
    processed++;
  }
  return {paired,processed};
}
