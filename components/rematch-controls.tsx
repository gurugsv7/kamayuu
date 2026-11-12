'use client';
import {useEffect,useRef,useState} from 'react';
import {RotateCcw,Clock3,Check,Flag} from 'lucide-react';
import ActionButton,{ActivityMark} from './action-button';
export type RematchOffer={status:string;fromSeat?:number|null;expiresAt?:number|null};
export default function RematchControls({offer,onResponse,allowIncoming=true,opponentName='your opponent'}:{offer:RematchOffer|null;onResponse:(response:string)=>void|Promise<void>;allowIncoming?:boolean;opponentName?:string}){
 const [now,setNow]=useState(()=>Date.now()),[pending,setPending]=useState(false),[error,setError]=useState('');const locked=useRef(false);
 useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),500);return()=>clearInterval(id);},[]);
 const expired=offer?.status==='offered'&&!!offer.expiresAt&&offer.expiresAt<=now;
 const closed=expired||['declined','expired','unavailable'].includes(offer?.status||'');
 const accepted=offer?.status==='accepted',outgoing=offer?.status==='offered'&&offer.fromSeat===0,incoming=offer?.status==='offered'&&!outgoing&&!closed;
 const hidden=incoming&&!allowIncoming;
 const seconds=offer?.expiresAt?Math.max(0,Math.ceil((offer.expiresAt-now)/1000)):null;
 const title=accepted?'The next hand awaits':closed?(expired||offer?.status==='expired'?'This offer has expired':'This table is closed'):hidden?'Rematch requests are off':outgoing?'Your invitation is on the table':incoming?'One more round?':'Another hand?';
 const description=accepted?'Preparing your rematch…':closed?'Choose another opponent below to keep playing.':hidden?'You can change this in Settings.':outgoing?'Waiting for '+opponentName+' to respond.':incoming?opponentName+' has invited you to play again.':'Invite '+opponentName+' back to the table.';
 async function respond(command:string){if(locked.current)return;locked.current=true;setPending(true);setError('');try{await onResponse(command);}catch{setError('That request didn’t reach the table. Please try again.');}finally{locked.current=false;setPending(false);}}
 const state=accepted?'accepted':closed?'closed':hidden?'hidden':incoming?'incoming':outgoing?'outgoing':'idle';
 return <section className="rematch-panel" data-state={state} aria-label="Rematch"><div className="rematch-heading"><span className="feedback-emblem" aria-hidden="true">{accepted?<Check size={23}/>:closed?<Flag size={23}/>:outgoing?<Clock3 size={23}/>:<RotateCcw size={23}/>}</span><div><small>The next hand</small><h3>{title}</h3></div>{(outgoing||incoming)&&!closed&&seconds!==null&&<span className="rematch-expiry" aria-label={seconds+' seconds to respond'}>{seconds}<small>sec</small></span>}</div>{(incoming||outgoing)&&!closed&&!hidden&&<img className="rematch-card-art" src="/loaders/matchmaking-cut-still.png" width={256} height={224} alt=""/>}<p className="rematch-description" role="status">{(outgoing||accepted)&&!closed&&<ActivityMark/>}{description}</p>{error&&<p className="rematch-error" role="alert">{error}</p>}{!closed&&!accepted&&!hidden&&<div className="rematch-buttons">{outgoing?<ActionButton className="action-secondary" disabled={pending} busyLabel="Withdrawing…" onAction={()=>respond('cancel')}>Withdraw request</ActionButton>:incoming?<><ActionButton disabled={pending} busyLabel="Confirming…" onAction={()=>respond('accept')}>Accept rematch</ActionButton><ActionButton className="action-secondary" disabled={pending} busyLabel="Declining…" onAction={()=>respond('decline')}>No thanks</ActionButton></>:<ActionButton disabled={pending} busyLabel="Sending invitation…" onAction={()=>respond('request')}>Request rematch <RotateCcw size={16} aria-hidden="true"/></ActionButton>}</div>}</section>;
}
