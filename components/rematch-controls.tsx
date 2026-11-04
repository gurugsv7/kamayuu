'use client';
import {useEffect,useState} from 'react';
import ActionButton,{ActivityMark} from './action-button';
export type RematchOffer={status:string;fromSeat?:number|null;expiresAt?:number|null};
export default function RematchControls({offer,onResponse,allowIncoming=true}:{offer:RematchOffer|null;onResponse:(response:string)=>void|Promise<void>;allowIncoming?:boolean}){
  const [now,setNow]=useState(()=>Date.now());
  useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id);},[]);
  const expired=offer?.status==='offered'&&!!offer.expiresAt&&offer.expiresAt<=now;
  if(offer?.status==='accepted')return <output className="rematch-status action-status"><ActivityMark/>Starting your next hand…</output>;
  if(expired||['declined','expired'].includes(offer?.status||''))return <output className="rematch-status">{expired||offer?.status==='expired'?'Rematch offer expired.':'Rematch declined. Find another opponent when you’re ready.'}</output>;
  if(offer?.status==='offered'){
    if(offer.fromSeat===0)return <><output className="rematch-status action-status"><ActivityMark/>Rematch requested. Waiting for a response…</output><ActionButton className="action-secondary" busyLabel="Cancelling…" onAction={()=>onResponse('cancel')}>Cancel request</ActionButton></>;
    if(!allowIncoming)return <p>Incoming rematch requests are off.</p>;
    return <><output className="rematch-status">Your opponent wants another round.</output><ActionButton busyLabel="Confirming rematch…" onAction={()=>onResponse('accept')}>Accept rematch</ActionButton><button className="text-action" onClick={()=>onResponse('decline')}>No thanks</button></>;
  }
  return <ActionButton busyLabel="Sending request…" onAction={()=>onResponse('request')}>Request rematch</ActionButton>;
}
