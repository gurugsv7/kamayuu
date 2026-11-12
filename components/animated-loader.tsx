'use client';
import {useState} from 'react';
import '@/app/loaders.css';

/** Decorative only: the surrounding status text owns the accessible message. */
export default function AnimatedLoader({kind,motionShort=false}:{kind:'opening'|'matchmaking';motionShort?:boolean}){
 const [failed,setFailed]=useState(''),[loaded,setLoaded]=useState('');
 const name=kind==='opening'?'opening-deal-v2':'matchmaking-table-v4';
 const base=`/loaders/${name}`;
 const ready=loaded===base;
 return <span className={`kamayuu-animated-loader kamayuu-animated-loader-${kind} loader-ensemble`} aria-hidden="true">
  {motionShort||failed===base?<img src={`${base}-still.png`} alt="" width={384} height={320} draggable={false}/>:<>
   {!ready&&<img className="loader-poster" src={`${base}-still.png`} alt="" width={384} height={320} draggable={false}/>}
   <picture>
    <source media="(prefers-reduced-motion: reduce)" srcSet={`${base}-still.png`}/>
    <source type="image/webp" srcSet={`${base}.webp`}/>
    <img src={`${base}.gif`} style={{opacity:ready?1:0}} alt="" width={384} height={320} draggable={false} onLoad={()=>setLoaded(base)} onError={()=>setFailed(base)}/>
   </picture></>}
 </span>;
}
