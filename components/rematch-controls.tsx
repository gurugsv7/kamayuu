'use client';
import {useEffect,useState} from 'react';
export type RematchOffer={status:string;fromSeat?:number|null;expiresAt?:number|null};
export default function RematchControls({offer,onResponse,allowIncoming=true}:{offer:RematchOffer|null;onResponse:(response:string)=>void;allowIncoming?:boolean}){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id);},[]);
  const expired=offer?.status==='offered'&&!!offer.expiresAt&&offer.expiresAt<=now;
  if(offer?.status==='accepted')return <output className="rematch-status">Starting your next hand…</output>;
  if(expired||['declined','expired'].includes(offer?.status||''))return <output className="rematch-status">{expired||offer?.status==='expired'?'Rematch offer expired.':'Rematch declined. Find another opponent when you’re ready.'}</output>;
  if(offer?.status==='offered'){
    if(offer.fromSeat===0)return <><output className="rematch-status">Rematch requested. Waiting for a response…</output><button className="text-action" onClick={()=>onResponse('cancel')}>Cancel request</button></>;
    if(!allowIncoming)return <p>Incoming rematch requests are off.</p>;
    return <><output className="rematch-status">Your opponent wants another round.</output><button className="primary" onClick={()=>onResponse('accept')}>Accept rematch</button><button className="text-action" onClick={()=>onResponse('decline')}>No thanks</button></>;
  }
  return <button className="primary" onClick={()=>onResponse('request')}>Request rematch</button>;
}
