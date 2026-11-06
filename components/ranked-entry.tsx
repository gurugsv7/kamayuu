'use client';
import {useEffect,useRef,useState} from 'react';
import {RankedService,type RankedStatus} from '@/lib/ranked';
import {Swords,Shield,WifiOff} from 'lucide-react';
import ActionButton,{ActivityMark} from './action-button';
import {rankedFailure} from '@/lib/ranked-feedback.mjs';
import AnimatedLoader from './animated-loader';
import RankStanding from './rank-standing';
export default function RankedEntry({onEnter,allowRematches,onSignIn,motionShort=false}:{onEnter:(id:string)=>void;allowRematches:boolean;onSignIn?:()=>void;motionShort?:boolean}){
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
  return <RankedEntryContent status={status} error={error} queued={queued} motionShort={motionShort} onSignIn={onSignIn}
    onRetry={async()=>{setError(null);try{setStatus(await service.current.status());}catch(e:unknown){setError(e);}}}
    onAcknowledge={async()=>{if(!status)return;setError('');try{setStatus(await service.current.acknowledge(status.disclosureVersion));}catch(e:unknown){setError(e);}}}
    onCancel={async()=>{try{await cancel();}catch(e:unknown){setError(e);}}}
    onJoin={()=>status?.activeMatchId?onEnter(status.activeMatchId):join()}/>;
}

type RankedEntryContentProps={status:RankedStatus|null;error?:unknown;queued?:boolean;motionShort?:boolean;onSignIn?:()=>void;onRetry:()=>Promise<void>;onAcknowledge:()=>Promise<void>;onCancel:()=>Promise<void>;onJoin:()=>void|Promise<void>};
/** Shared rendering for the live queue and the local design review. */
export function RankedEntryContent({status,error,queued=false,motionShort=false,onSignIn,onRetry,onAcknowledge,onCancel,onJoin}:RankedEntryContentProps){
  return <div className={'online-content ranked-entry'+(queued?' is-searching':'')}>
    {!!error&&<section className="ranked-recovery" aria-label="Ranked connection" role="alert"><span className="feedback-emblem" aria-hidden="true"><WifiOff size={26}/></span><small>Back to the table</small><h3>{rankedFailure(error).title}</h3><p>{rankedFailure(error).message}</p>{rankedFailure(error).auth&&onSignIn?<ActionButton onAction={onSignIn}>Sign in</ActionButton>:!queued&&<ActionButton busyLabel="Reconnecting…" onAction={onRetry}>Try again <span aria-hidden="true">↻</span></ActionButton>}</section>}
    {!status&&!error&&<output className="action-status"><ActivityMark/> Checking ranked availability…</output>}
    {status?.needsDisclosure?<><div className="ranked-notice"><Shield size={26} aria-hidden="true"/><h3>Before your first hand</h3><p>{status.disclosureText}</p></div><ActionButton onAction={onAcknowledge} busyLabel="Saving your choice…">I understand · Continue</ActionButton></>:
      status&&<><RankStanding rating={status.rating} played={status.played}/>{!status.enabled?<p className="ranked-unavailable">Ranked is not open yet. Play Practice or join a Private Table while you wait.</p>:
        queued?<><section className="ranked-search" aria-label="Matchmaking status" aria-live="polite"><AnimatedLoader kind="matchmaking" motionShort={motionShort||!!error}/><strong>Finding your next table</strong><p>{error?'Connection interrupted. Retrying…':'Looking for an opponent…'}</p></section><ActionButton className="action-secondary" busyLabel="Cancelling search…" onAction={onCancel}>Cancel search</ActionButton></>:
        <><p className="ranked-entry-note">One ladder · Bronze to Diamond</p><ActionButton busyLabel={status.activeMatchId?'Opening your table…':'Preparing your search…'} onAction={onJoin}><Swords size={18} aria-hidden="true"/>{status.activeMatchId?'Resume match':'Find match'}<span aria-hidden="true">→</span></ActionButton></>}</>}
    {status&&!status.needsDisclosure&&<p className="ranked-footnote">Human-first matchmaking. Every hand counts.</p>}
  </div>;
}
