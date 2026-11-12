// Upper bounds for the ORIGINAL eventsPlay sequence, shared by all clients.
// A bounded delivery allowance covers polling/network transit, not thinking time.
export const PRESENTATION_DELIVERY_MS=2000;
export function presentationMs(events){return events.reduce((sum,e)=>sum+(
 e.type==='draw'?1120:e.type==='take'?490:e.type==='replace'?2890:
 e.type==='discard'?750:e.type==='peek'?2160:e.type==='inspect'?800:
 e.type==='swap'?2850:e.type==='swapEnd'?330:e.type==='match'?(e.ok?1460:3920):
 e.type==='buzz'?1400:e.type==='pass'?800:e.type==='eliminate'?1100:0),0);}

export function pauseForPresentation(room,events,now){
 if(!room.deadline||['memory','finished'].includes(room.state?.phase))return;
 const duration=presentationMs(events);if(!duration)return;
 const remaining=Math.max(0,room.deadline-Math.max(now,room.clockStartedAt||now));
 room.presentationId=(room.presentationId||0)+1;
 room.presentationEvents=structuredClone(events);room.presentationAt=now;
 room.presentationMinUntil=now+duration;
 room.presentationUntil=now+Math.min(8000,duration+PRESENTATION_DELIVERY_MS);
 room.clockRemainingMs=remaining;room.clockStartedAt=room.presentationUntil;
 room.deadline=room.clockStartedAt+remaining;
}

export function completePresentation(room,userId,id,now){
 if(id!==room.presentationId||room.members[room.state?.active]?.id!==userId||!room.presentationUntil||now>=room.presentationUntil)return;
 if(room.presentationAcknowledged===id)return;
 room.presentationAcknowledged=id;
 const start=Math.max(now,room.presentationMinUntil||now);
 room.presentationUntil=start;room.clockStartedAt=start;room.deadline=start+room.clockRemainingMs;
}
