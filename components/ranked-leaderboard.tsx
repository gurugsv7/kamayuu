'use client';
import {useEffect,useState} from 'react';
import {RankedService,type RankedLeaderboard} from '@/lib/ranked';
import {rankProgress} from '@/lib/rank-display.mjs';
import {TierBadge} from './rank-standing';
import ActionButton,{ActivityMark} from './action-button';

export default function RankedLeaderboardView(){
 const [data,setData]=useState<RankedLeaderboard|null>(null),[error,setError]=useState('');
 const [offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 useEffect(()=>{
  let live=true;
  void new RankedService().leaderboard(offset).then(x=>{if(live)setData(x);}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load the standings.');}).finally(()=>{if(live)setLoading(false);});
  return()=>{live=false;};
 },[offset,attempt]);
 return <LeaderboardContent data={data} error={error} loading={loading}
  onRetry={()=>{setError('');setLoading(true);setAttempt(n=>n+1);}}
  onPage={n=>{setError('');setLoading(true);setOffset(n);setAttempt(a=>a+1);}}/>;
}

export function LeaderboardContent({data,error='',loading=false,onRetry,onPage}:{data:RankedLeaderboard|null;error?:string;loading?:boolean;onRetry:()=>void;onPage:(offset:number)=>void}){
 return <div className="leaderboard-content" aria-busy={loading}>
  {error&&<div className="ranked-recovery" role="alert"><h3>The standings are out of reach</h3><p>{error}</p><ActionButton onAction={onRetry}>Try again</ActionButton></div>}
  {!data&&loading&&<output className="action-status"><ActivityMark/>Loading standings…</output>}
  {data&&<>
   <div className="leaderboard-season"><span>{data.season}</span><small>{data.total.toLocaleString()} entries</small></div>
   <div className="leaderboard-columns" aria-hidden="true"><span>Rank</span><span>Player</span><span>Rating</span></div>
   <ol className="honor-roll" aria-label="Ranked standings" start={data.offset+1}>{data.entries.map(entry=>{
    const {tier}=rankProgress(entry.rating);
    return <li className={'honor-row'+(entry.rank<=3?' honor-top':'')} key={entry.entry_id}>
     <span className="honor-position" aria-label={`Rank ${entry.rank}`}>{entry.rank}</span>
     <TierBadge tier={tier.id}/>
     <div className="honor-player"><strong title={entry.name}>{entry.name}</strong><small>{entry.kind==='bot' ? tier.label : `${entry.wins} wins · ${entry.played} played`}</small></div>
     <span className="honor-rating">{entry.rating.toLocaleString()}</span>
    </li>;
   })}</ol>
   {!data.entries.length&&<p className="leaderboard-empty">No ranked results yet.<br/>Finish a ranked match to appear here.</p>}
   <p className="leaderboard-key">Player ratings change after matches. Rival ratings also move on a six-hour schedule; these adjustments add no wins or games.</p>
   {(data.offset>0||data.offset+data.entries.length<data.total)&&<nav className="leaderboard-pagination" aria-label="Leaderboard pages">
    <ActionButton className="action-secondary" disabled={loading||data.offset===0} onAction={()=>onPage(Math.max(0,data.offset-50))}>← Previous</ActionButton>
    <span>{data.entries.length?`${data.offset+1}–${data.offset+data.entries.length}`:'0'} of {data.total}</span>
    <ActionButton className="action-secondary" disabled={loading||!data.entries.length||data.offset+data.entries.length>=data.total} onAction={()=>onPage(data.offset+data.entries.length)}>Next →</ActionButton>
   </nav>}
   {loading&&<output className="leaderboard-updating"><ActivityMark/>Updating standings…</output>}
  </>}
 </div>;
}
