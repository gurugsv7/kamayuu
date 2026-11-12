/// <reference types="vite/client" />
// Local design fixture only. This is not an app build entry.
import {useState} from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/ranked.css';
import LoadingScreen from '../components/loading-screen';
import {RankedEntryContent} from '../components/ranked-entry';
import type {RankedStatus} from '../lib/ranked';
import './loader-preview.css';
function Preview(){
 const [short,setShort]=useState(false),[progress,setProgress]=useState(77),[replay,setReplay]=useState(0),[visible,setVisible]=useState(true);
 const full=new URLSearchParams(location.search).has('full');
 const status:RankedStatus={enabled:true,season:'Season 1',disclosureVersion:'ranked-ai-v1',disclosureText:'',needsDisclosure:false,rating:600,played:12,humanPlayed:4,tier:{id:'bronze',label:'Bronze',floor:0},ticket:null,activeMatchId:null};
 const noop=async()=>{};
 return <main className={full?'loader-review full-review':'loader-review'}>
  {!full&&<><header><h1>Kamayuu · The lantern opening</h1><p>Local motion review · Sample progress · No sign-in or matchmaking calls</p><a href="/">Open the game →</a></header><div className="loader-review-controls"><label><input type="checkbox" checked={short} onChange={e=>setShort(e.target.checked)}/>Reduced motion</label><label>Progress <input type="range" min={0} max={100} value={progress} onChange={e=>setProgress(+e.target.value)}/>{progress}%</label><button onClick={()=>{setVisible(true);setReplay(n=>n+1);}}>Replay opening</button><button onClick={()=>setVisible(false)}>Test ready exit</button><a href="?full=1">Full-screen opening →</a><a href="/ranked-preview.html">Ranked collection →</a></div></>}
  <div className="loader-review-grid"><section className="opening-stage" aria-label="Opening preview"><LoadingScreen key={replay} visible={visible} progress={progress} motionShort={short}/>{!visible&&<p className="preview-ready">The opening has cleared.<br/>In the game, your home screen is now ready.</p>}</section>
  {!full&&<section className="game-dialog ranked-dialog loader-match-stage" aria-label="Matchmaking preview"><div className="ranked-brand" aria-hidden="true"><img src="/loaders/opening-compass-still.png" alt="" width={42} height={37}/><span>Kamayuu</span></div><h2 data-slot="dialog-title">The Ranked Tables</h2><p data-slot="dialog-description">Find your next rival.</p><RankedEntryContent status={status} queued motionShort={short} onRetry={noop} onCancel={noop} onAcknowledge={noop} onJoin={noop}/></section>}</div>
  {full&&<a className="loader-review-back" href="/loader-preview.html">← Local preview</a>}
 </main>;
}
const root=createRoot(document.getElementById('loader-review-root')!);root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
