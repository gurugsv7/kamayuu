'use client';
import {useEffect,useRef,useState} from 'react';
import {RankedService,type RankedStatus} from '@/lib/ranked';
export default function RankedEntry({onEnter,allowRematches,onSignIn}:{onEnter:(id:string)=>void;allowRematches:boolean;onSignIn?:()=>void}){
  const service=useRef(new RankedService()),stopped=useRef(false),waiting=useRef(false),entering=useRef(false),polling=useRef(false);
  const [status,setStatus]=useState<RankedStatus|null>(null),[error,setError]=useState(''),[queued,setQueued]=useState(false);
  useEffect(()=>{const client=service.current;stopped.current=false;void client.status().then(setStatus).catch(e=>setError(e.message));return()=>{stopped.current=true;if(waiting.current)void client.cancel().catch(()=>{});};},[]);
  useEffect(()=>{
    if(!queued)return;
    let cancelled=false;
    const check=async()=>{
      if(polling.current)return;polling.current=true;
      try{
        const s=await service.current.enqueue();
        if(cancelled||stopped.current){await service.current.cancel();return;}setStatus(s);
        if(s.activeMatchId&&!entering.current){entering.current=true;waiting.current=false;onEnter(s.activeMatchId);}
      }catch(e:unknown){if(!cancelled)setError(e instanceof Error?e.message:'Could not join ranked.');}finally{polling.current=false;}
    };
    void check();const timer=setInterval(()=>void check(),1200);
    return()=>{cancelled=true;clearInterval(timer);};
  },[queued,onEnter]);
  async function join(){setError('');try{await service.current.preferences(allowRematches);waiting.current=true;setQueued(true);}catch(e:unknown){setError(e instanceof Error?e.message:'Could not join ranked.');}}
  async function cancel(){waiting.current=false;setQueued(false);const s=await service.current.cancel();setStatus(s);if(s.activeMatchId)onEnter(s.activeMatchId);}
  return <div className="online-content">
    {error&&<><p role="alert">{error}</p>{onSignIn&&<button className="primary" onClick={onSignIn}>Online account setup</button>}</>}
    {!status&&!error&&<p>Checking ranked availability…</p>}
    {status?.needsDisclosure?<><p>{status.disclosureText}</p><button className="primary" onClick={()=>void service.current.acknowledge(status.disclosureVersion).then(setStatus).catch(e=>setError(e.message))}>I understand · Continue</button></>:
      status&&<><p>{status.tier.label} · {status.rating} rating</p>{!status.enabled?<p>Ranked is not open yet. Play Practice or join a Private Table while you wait.</p>:
        queued?<><output>Finding an opponent…</output><button className="text-action" onClick={()=>void cancel().catch(e=>setError(e.message))}>Cancel search</button></>:
        <button className="primary" onClick={()=>status.activeMatchId?onEnter(status.activeMatchId):void join()}>{status.activeMatchId?'Resume match':'Find match'}</button>}</>}
  </div>;
}
