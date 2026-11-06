/// <reference types="vite/client" />
// Vite-only review entry. Not referenced by index.html or included in app builds.
// The fixtures below never enqueue a game, sign in, or call the backend.
import {useState,type ReactNode} from 'react';
import {createRoot} from 'react-dom/client';
import '../app/globals.css';
import '../app/ranked.css';
import './ranked-preview.css';
import {RankedEntryContent} from '../components/ranked-entry';
import {LeaderboardContent} from '../components/ranked-leaderboard';
import ScoreLedger from '../components/score-ledger';
import RematchControls,{type RematchOffer} from '../components/rematch-controls';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '../components/ui/dialog';
import {RANK_TIERS,rankProgress} from '../lib/rank-display.mjs';
import {RANKED_DISCLOSURE} from '../lib/ranked-config.mjs';
import type {RankedStatus,RankedLeaderboard} from '../lib/ranked';
function Brand(){return <div className="ranked-brand" aria-hidden="true"><img src="/loaders/opening-compass-still.png" width={52} height={46} alt=""/><span>Kamayuu</span></div>;}
function Shell({title,subtitle,children}:{title:string;subtitle:string;children:ReactNode}){return <div className="game-dialog ranked-dialog review-shell"><Brand/><h2 data-slot="dialog-title">{title}</h2><p data-slot="dialog-description">{subtitle}</p>{children}</div>;}
function Preview(){
 const [mode,setMode]=useState('all'),[queue,setQueue]=useState(true),[rating,setRating]=useState(600),[short,setShort]=useState(false),[entryState,setEntryState]=useState('ready');
 const [offer,setOffer]=useState<RematchOffer|null>(null),[invite,setInvite]=useState<RematchOffer|null>({status:'offered',fromSeat:1,expiresAt:Date.now()+60000}),[dialog,setDialog]=useState(false),[offset,setOffset]=useState(0),[longNames,setLongNames]=useState(false);
 const status:RankedStatus={enabled:entryState!=='disabled',season:'Season 1',rating,played:12,humanPlayed:5,tier:rankProgress(rating).tier,needsDisclosure:entryState==='disclosure',disclosureText:RANKED_DISCLOSURE,disclosureVersion:'ranked-ai-v1',activeMatchId:entryState==='resume'?'preview-match':null,ticket:null};
 const names=['Ishaan Rao','Meera Sen','Arjun Shah','Aarav Iyer','Nila Menon','Kabir Bose','Anaya Chen'];
 const data:RankedLeaderboard={season:'Season 1 · Lantern Ascendance',offset,total:57,entries:Array.from({length:Math.min(50,57-offset)},(_,i)=>({entry_id:String(offset+i),name:longNames?'A Very Long Player Name For Layout Review':names[i%names.length],rank:offset+i+1,kind:i%7===2||i%7===5?'bot':'human',rating_type:i%7===2||i%7===5?'benchmark':'competitive',rating:1990-(offset+i)*25,wins:18,played:30+i}))};
 const entry=<RankedEntryContent status={entryState==='loading'||entryState==='error'?null:status} error={entryState==='error'?Error('Network connection interrupted'):null} queued={queue&&entryState!=='error'} motionShort={short} onRetry={async()=>setEntryState('ready')} onAcknowledge={async()=>setEntryState('ready')} onCancel={async()=>setQueue(false)} onJoin={async()=>setQueue(true)}/>;
 function respond(setter:(x:RematchOffer|null)=>void,response:string){setter(response==='request'?{status:'offered',fromSeat:0,expiresAt:Date.now()+30000}:response==='cancel'?null:{status:response==='accept'?'accepted':'declined'});}
 return <main className="design-review"><header className="review-toolbar"><div><h1>Kamayuu · The ranked collection</h1><p>Local design review · Sample data · No online requests</p></div><a href="/">Open the game →</a></header>
  <nav className="review-tabs" aria-label="Preview screens">{['all','matchmaking','leaderboard','result','rematch'].map(x=><button key={x} aria-pressed={mode===x} onClick={()=>setMode(x)}>{x}</button>)}</nav>
  <div className="review-options"><label>Tier <select value={rating} onChange={e=>setRating(Number(e.target.value))}>{RANK_TIERS.map(t=><option key={t.id} value={t.floor===0?600:t.floor+80}>{t.label}</option>)}</select></label><label>Entry state <select value={entryState} onChange={e=>setEntryState(e.target.value)}>{['ready','loading','error','disclosure','disabled','resume'].map(x=><option key={x}>{x}</option>)}</select></label><label><input type="checkbox" checked={short} onChange={e=>setShort(e.target.checked)}/>Reduced motion</label><label><input type="checkbox" checked={longNames} onChange={e=>setLongNames(e.target.checked)}/>Long names</label><button onClick={()=>setDialog(true)}>Open real dialog</button><button onClick={()=>setInvite({status:'offered',fromSeat:1,expiresAt:Date.now()+30000})}>Reset invitation</button><button onClick={()=>setInvite({status:'offered',fromSeat:1,expiresAt:Date.now()-1000})}>Expired invitation</button></div>
  <div className={'review-grid review-mode-'+mode}>
   {(mode==='all'||mode==='matchmaking')&&<section className="review-device" aria-label="Matchmaking preview"><Shell title="The Ranked Tables" subtitle="Find your next rival.">{entry}</Shell></section>}
   {(mode==='all'||mode==='leaderboard')&&<section className="review-device" aria-label="Leaderboard preview"><Shell title="The Honor Roll" subtitle="Every place is earned."><LeaderboardContent data={data} onRetry={()=>{}} onPage={setOffset}/></Shell></section>}
   {(mode==='all'||mode==='result')&&<section className="review-device review-result" aria-label="Results preview"><ScoreLedger players={[{name:'You',total:8,cards:3,penalty:0,eliminated:false,winner:true,you:true},{name:longNames?'A Very Long Opponent Name For Review':'Arjun Shah',total:19,cards:4,penalty:0,eliminated:false,winner:false,you:false}]} winnerNames={['You']} winningTotal={8}><RematchControls offer={offer} opponentName="Arjun Shah" onResponse={r=>respond(setOffer,r)}/><button className="text-action" onClick={()=>{setMode('matchmaking');setQueue(true);}}>Find another opponent</button><button className="text-action" onClick={()=>setMode('all')}>View table</button></ScoreLedger></section>}
   {(mode==='all'||mode==='rematch')&&<section className="review-device" aria-label="Rematch preview"><Shell title="The Next Hand" subtitle="A familiar rival. A fresh start."><RematchControls offer={invite} opponentName={longNames?'A Very Long Opponent Name For Review':'Arjun Shah'} onResponse={r=>respond(setInvite,r)}/><button className="text-action" onClick={()=>setMode('matchmaking')}>Find another opponent</button></Shell></section>}
  </div>
  <Dialog open={dialog} onOpenChange={setDialog}><DialogContent className="game-dialog ranked-dialog"><Brand/><DialogTitle>The Ranked Tables</DialogTitle><DialogDescription>Find your next rival.</DialogDescription>{entry}</DialogContent></Dialog>
 </main>;
}
const root=createRoot(document.getElementById('ranked-review-root')!);
root.render(<Preview/>);
if(import.meta.hot)import.meta.hot.dispose(()=>root.unmount());
