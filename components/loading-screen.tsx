'use client';
import {useEffect,useState} from 'react';
import AnimatedLoader from './animated-loader';
// The decorative deal can loop independently; never extend the opening budget
// just to finish it. Readiness still belongs to the existing loading gates.
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
 // on a fast connection, would freeze a full bar while the compass keeps
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
  <div className={'kamayuu-loader loader-scene'+(visible?'':' kamayuu-loader-exit')} data-short-motion={motionShort||undefined} style={{'--motion-scale':motionShort?.65:1} as React.CSSProperties} role="status" aria-live="polite" aria-label="Loading Kamayuu">
   <img className="loader-backdrop" src="/loaders/opening-scene.webp" alt="" fetchPriority="high"/>
   <div className="loader-vignette" aria-hidden="true"/>
   <div className="loader-lantern-light" aria-hidden="true"/>
   <div className="loader-motes" aria-hidden="true">{[0,1,2,3,4,5].map(i=><i key={i} style={{'--mote':i} as React.CSSProperties}/>)}</div>
   <div className="kamayuu-loader-body">
    <p className="loader-eyebrow"><span/>The lantern table<span/></p>
    <div className="loader-wordmark"><img src="/loaders/kamayuu-wordmark.webp" alt="Kamayuu" width={900} height={300} fetchPriority="high"/></div>
    <p className="kamayuu-caption">{caption||'A GAME OF MEMORY & MOVES'}</p>
    <div className="loader-deal-stage"><AnimatedLoader kind="opening" motionShort={motionShort}/></div>
    <div className="loader-progress-panel">
     <div className="loader-progress-heading"><span>{pct<100?(pct<50?'Preparing the deck':'Opening the table'):'Your table is ready'}</span><b aria-hidden="true">{pct}<small>%</small></b></div>
     <div className="kamayuu-progress" aria-hidden="true"><div className="kamayuu-progress-track"><div className="kamayuu-progress-fill" style={{width:pct+'%'}}/></div></div>
     <div className="loader-progress-stages" aria-hidden="true"><span className={pct>0?'is-lit':''}/><span className={pct>=50?'is-lit':''}/><span className={pct===100?'is-lit':''}/></div>
    </div>
   </div>
   <p className="loader-signature">Remember. Observe. Outthink.</p>
  </div>
 );
}
