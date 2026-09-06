'use client';
import {useEffect,useState} from 'react';
// The lantern-table lotus, redrawn as four separate strokes so each petal
// group can animate its own stroke-dashoffset (pathLength normalizes every
// path to length 1, so one keyframe set works regardless of geometry).
const PETALS=[
 'M50 61C28 48 34 26 50 11c16 15 22 37 0 50Z',
 'M50 61C23 62 12 41 12 29c24 0 35 12 38 32ZM50 61c27 1 38-20 38-32-24 0-35 12-38 32Z',
 'M50 61C29 74 12 61 4 49c17-6 31-1 46 12Zm0 0c21 13 38 0 46-12-17-6-31-1-46 12Z',
 'M50 24v29M31 71h38',
];
// The full draw-in cycle, derived from globals.css so the two never silently
// drift apart. The last thing to settle is .kamayuu-progress-label
// (1.4s delay + .6s kamayuuFadeUp = 2.0s) — it outlasts even the final petal
// (.kamayuu-petal-3: .6s delay + 1.1s kamayuuDraw = 1.7s). Scaled by the same
// --motion-scale factor CSS applies (see motionShort below).
export const KAMAYUU_CYCLE_MS=2000;
export default function LoadingScreen({visible,progress,motionShort,caption}:{visible:boolean;progress:number;motionShort?:boolean;caption?:string}){
 const [mounted,setMounted]=useState(true);
 const [timeProgress,setTimeProgress]=useState(0);
 useEffect(()=>{
  if(visible){setMounted(true);return;}
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const t=setTimeout(()=>setMounted(false),reduced?0:560);
  return ()=>clearTimeout(t);
 },[visible]);
 // Drives the progress bar's OWN pacing so it eases to 100% across the full
 // draw-in cycle instead of snapping there the instant assets settle (which,
 // on a fast connection, would freeze a full bar while the lotus keeps
 // drawing). Reduced-motion skips the ease entirely — the bar just reflects
 // real progress right away, same as the exit-fade bypass above.
 useEffect(()=>{
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced){setTimeProgress(100);return;}
  const duration=KAMAYUU_CYCLE_MS*(motionShort?0.65:1);
  const start=performance.now();
  let raf=0;
  const tick=()=>{
   const elapsed=performance.now()-start;
   setTimeProgress(Math.min(100,elapsed/duration*100));
   if(elapsed<duration)raf=requestAnimationFrame(tick);
  };
  raf=requestAnimationFrame(tick);
  return ()=>cancelAnimationFrame(raf);
 },[motionShort]);
 if(!mounted)return null;
 // The displayed value is whichever of real asset progress and elapsed-time
 // progress is further behind — both are monotonic, so this never regresses,
 // never claims 100% while assets are still outstanding (real progress caps
 // it), and never sits at a frozen 100% before the animation has actually
 // finished (time progress caps it on fast connections).
 const pct=Math.max(0,Math.min(100,Math.round(Math.min(progress,timeProgress))));
 return (
  <div className={'kamayuu-loader'+(visible?'':' kamayuu-loader-exit')} style={{'--motion-scale':motionShort?.65:1} as React.CSSProperties} role="status" aria-live="polite" aria-label="Loading Kamayuu">
   <div className="kamayuu-loader-glow" aria-hidden="true"/>
   <div className="kamayuu-loader-body">
    <svg className="kamayuu-lotus-mark" viewBox="0 0 100 80" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
     {PETALS.map((d,i)=><path key={i} d={d} pathLength={1} className={'kamayuu-petal kamayuu-petal-'+i}/>)}
    </svg>
    <p className="kamayuu-word">KAM<span className="kamayuu-word-kern">A</span>YUU</p>
    <p className="kamayuu-caption">{caption||'A GAME OF MEMORY & NERVE'}</p>
    <div className="kamayuu-progress" aria-hidden="true">
     <div className="kamayuu-progress-track"><div className="kamayuu-progress-fill" style={{width:pct+'%'}}/></div>
    </div>
    <p className="kamayuu-progress-label">{pct<100?`${pct<50?'SHUFFLING THE DECK':'DEALING THE TABLE'} · ${pct}%`:'READY'}</p>
   </div>
  </div>
 );
}
