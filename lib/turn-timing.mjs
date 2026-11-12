export const DRAW_MS=7_000;
export const PLAY_MS=25_000;
export function phaseDuration(phase){return phase==='memory'?30_000:phase==='lastCall'?5_000:phase==='ready'?DRAW_MS:PLAY_MS;}

// receivedAt is stamped before any client animation; recover packets must not
// normalize the ring against their shorter remaining time.
export function turnClock(room,phase,now=Date.now()){
 const duration=room.clockDurationMs||phaseDuration(phase);
 const serverNow=(room.serverTime??now)+Math.max(0,now-(room.receivedAt??now));
 const remaining=Math.max(0,room.deadline-Math.max(serverNow,room.clockStartedAt||serverNow));
 return {seconds:Math.ceil(remaining/1000),progress:Math.max(0,Math.min(1,remaining/duration))};
}
