// Shared pure policy. Missing or malformed state always has the least privilege.
export const FAMILY_NOTICE = 'family-2026-11-v1';
export const AGE_BANDS = ['under_13', '13_17', '18_plus'];
export async function readFamilyResponse(response){
 let data;try{data=await response.json();}catch{throw Error('Online account services are not ready yet. Practice is available offline.');}
 if(!response.ok)throw Error(typeof data?.error==='string'?data.error:'Could not update family settings.');
 return data;
}
export function familyPermissions(account) {
  const known = AGE_BANDS.includes(account?.age_band);
  const child = account?.age_band === 'under_13';
  // First release: children use local practice only, even with historical consent.
  const online = known && !child && !account?.revoked;
  return {known, child, online, analytics: known && !child && !account?.revoked,
    social: online && (!child || account?.social_allowed === true),
    rematches: online && (!child || account?.rematches_allowed === true)};
}
export function enforceFamily(account, input) {
  const p = familyPermissions(account);
  if (input.command === 'track') return p.analytics;
  if (!p.online && !['leave','cancel'].includes(input.command)) throw Error(p.child?'Online play is available for ages 13 and above. Practice is available on this device.':'Complete age setup before online play.');
  if (!p.social && ['message','emote'].includes(input.command)) throw Error('Reactions are disabled by your parent.');
  if (!p.rematches && ['rematch','rematch_request','rematch_accept'].includes(input.command)
    && !['status','decline','cancel'].includes(input.response||input.action)) throw Error('Rematches are disabled by your parent.');
  return true;
}
// Child recipients never receive other players' freeform names or freeform text.
// Preset reactions are also removed when the guardian disables interactions.
export function familyPacket(packet, account) {
  const p = familyPermissions(account);
  if (!p.child) return packet;
  if (!p.online) return {accessRevoked:true};
  if (packet?.packet) return {...packet,packet:familyPacket(packet.packet,account),...(!p.rematches?{rematch:null,nextMatchId:null}:{})};
  if (packet?.entries) return {...packet,entries:packet.entries.map((entry,i)=>({...entry,name:`Player ${i+1}`,display_name:`Player ${i+1}`}))};
  if (!packet?.room) return packet;
  const out = structuredClone(packet);
  out.room.members = out.room.members?.map((m,i)=>({...m,name:`Player ${i+1}`}));
  if (out.state?.players) out.state.players = out.state.players.map((m,i)=>({...m,name:i===0?'You':`Player ${i+1}`}));
  const safe = e => !['emote','message'].includes(e.type) || p.social &&
    (e.type==='emote' ? ['haha','angry','noooo','crying','cool'].includes(e.name) : ['Good luck!','Nice move!','Oops!','Well played!','Your turn!'].includes(e.text));
  out.events = out.events?.filter(safe);
  out.social = out.social?.filter(safe);
  if (!p.rematches) out.room.rematch = null;
  return out;
}
