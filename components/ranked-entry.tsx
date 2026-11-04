'use client';
import {useEffect,useRef,useState} from 'react';
import {RankedService,type RankedStatus} from '@/lib/ranked';
import {Swords,Shield,WifiOff} from 'lucide-react';
import ActionButton,{ActivityMark} from './action-button';
import {rankedFailure} from '@/lib/ranked-feedback.mjs';
export default function RankedEntry({onEnter,allowRematches,onSignIn}:{onEnter:(id:string)=>void;allowRematches:boolean;onSignIn?:()=>void}){
  const service=useRef(new RankedService()),stopped=useRef(false),waiting=useRef(false),entering=useRef(false),polling=useRef(false);
  const [status,setStatus]=useState<RankedStatus|null>(null),[error,setError]=useState<unknown>(null),[queued,setQueued]=useState(false);
  useEffect(()=>{const client=service.current;stopped.current=false;void client.status().then(setStatus).catch(e=>setError(e));return()=>{stopped.current=true;if(waiting.current)void client.cancel().catch(()=>{});};},[]);
  useEffect(()=>{
    if(!queued)return;
    let cancelled=false;
    const check=async()=>{
      if(polling.current||!waiting.current)return;polling.current=true;
      try{
        const s=await service.current.enqueue();
        if(cancelled||stopped.current){await service.current.cancel();return;}if(!waiting.current)return;setStatus(s);setError('');
        if(s.activeMatchId&&!entering.current){entering.current=true;waiting.current=false;onEnter(s.activeMatchId);}
      }catch(e:unknown){if(!cancelled)setError(e);}finally{polling.current=false;}
    };
    void check();const timer=setInterval(()=>void check(),1200);
    return()=>{cancelled=true;clearInterval(timer);};
  },[queued,onEnter]);
  async function join(){setError('');try{await service.current.preferences(allowRematches);waiting.current=true;setQueued(true);}catch(e:unknown){setError(e);}}
  async function cancel(){waiting.current=false;try{const s=await service.current.cancel();setStatus(s);setQueued(false);if(s.activeMatchId)onEnter(s.activeMatchId);}catch(e){waiting.current=true;throw e;}}
  return <div className="online-content ranked-entry">
    {!!error&&<section className="ranked-recovery" aria-label="Ranked connection" role="alert"><span className="feedback-emblem" aria-hidden="true"><WifiOff size={26}/></span><small>Back to the table</small><h3>{rankedFailure(error).title}</h3><p>{rankedFailure(error).message}</p>{rankedFailure(error).auth&&onSignIn?<ActionButton onAction={onSignIn}>Sign in</ActionButton>:!queued&&<ActionButton busyLabel="Reconnecting…" onAction={async()=>{setError(null);try{setStatus(await service.current.status());}catch(e:unknown){setError(e);}}}>Try again <span aria-hidden="true">↻</span></ActionButton>}</section>}
    {!status&&!error&&<output className="action-status"><ActivityMark/> Checking ranked availability…</output>}
    {status?.needsDisclosure?<><div className="ranked-notice"><Shield size={22} aria-hidden="true"/><p>{status.disclosureText}</p></div><ActionButton onAction={async()=>{setError('');try{setStatus(await service.current.acknowledge(status.disclosureVersion));}catch(e:unknown){setError(e);}}} busyLabel="Saving your choice…">I understand · Continue</ActionButton></>:
      status&&<><div className="ranked-standing"><span className="ranked-crest" aria-hidden="true"><Shield size={30}/></span><div><small>Your current tier</small><strong>{status.tier.label}</strong></div><div className="ranked-rating"><strong>{status.rating}</strong><small>Rating</small></div></div>{!status.enabled?<p>Ranked is not open yet. Play Practice or join a Private Table while you wait.</p>:
        queued?<><section className="ranked-search" aria-label="Matchmaking status" aria-live="polite"><span className="search-orbit" aria-hidden="true"><Swords size={26}/></span><strong>Finding your next table</strong><p>{error?'Connection interrupted. Retrying…':'Looking for an opponent…'}</p></section><ActionButton className="action-secondary" busyLabel="Cancelling search…" onAction={async()=>{try{await cancel();}catch(e:unknown){setError(e);}}}>Cancel search</ActionButton></>:
        <><p className="ranked-entry-note">One ladder · Bronze to Diamond</p><ActionButton busyLabel={status.activeMatchId?'Opening your table…':'Preparing your search…'} onAction={()=>status.activeMatchId?onEnter(status.activeMatchId):join()}><Swords size={18} aria-hidden="true"/>{status.activeMatchId?'Resume match':'Find match'}<span aria-hidden="true">→</span></ActionButton></>}</>}
  </div>;
}
