'use client';
import {useEffect,useState} from 'react';
import {RankedService,type RankedLeaderboard} from '@/lib/ranked';
import {rankProgress} from '@/lib/rank-display.mjs';
import {TierBadge} from './rank-standing';
import ActionButton,{ActivityMark} from './action-button';
import {Search,X} from 'lucide-react';

export default function RankedLeaderboardView(){
 const [data,setData]=useState<RankedLeaderboard|null>(null),[error,setError]=useState('');
 const [offset,setOffset]=useState(0),[attempt,setAttempt]=useState(0),[loading,setLoading]=useState(true);
 const [search,setSearch]=useState('');
 const [season,setSeason]=useState('');
 useEffect(()=>{
  let live=true;
  const timer=setTimeout(()=>{
   void new RankedService().leaderboard(offset,search).then(x=>{if(live){setData(x);setSeason(x.season);}}).catch(e=>{if(live)setError(e instanceof Error?e.message:'Could not load the standings.');}).finally(()=>{if(live)setLoading(false);});
  },search?250:0);
  return()=>{live=false;clearTimeout(timer);};
 },[offset,attempt,search]);
 return <LeaderboardContent data={data} error={error} loading={loading} search={search} season={season}
  onSearch={value=>{setSearch(value);setOffset(0);setError('');setLoading(true);}}
  onRetry={()=>{setError('');setLoading(true);setAttempt(n=>n+1);}}
  onPage={n=>{setError('');setLoading(true);setOffset(n);setAttempt(a=>a+1);}}/>;
}

export function LeaderboardContent({data,error='',loading=false,onRetry,onPage,search='',onSearch,season=''}:{data:RankedLeaderboard|null;error?:string;loading?:boolean;onRetry:()=>void;onPage:(offset:number)=>void;search?:string;onSearch?:(value:string)=>void;season?:string}){
 return <div className="leaderboard-content" aria-busy={loading}>
  {(data||season)&&<div className="leaderboard-season"><span>{data?.season||season}</span><small>{loading?'Searching…':data?`${data.total.toLocaleString()} ${search.trim()?'found':'entries'}`:''}</small></div>}
  {onSearch&&<div className="leaderboard-search" role="search" aria-label="Search leaderboard">
   <Search size={16} aria-hidden="true"/>
   <input type="search" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="Search player or rival name" placeholder="Search names" maxLength={40} value={search} onChange={event=>onSearch(event.target.value)}/>
   {search&&<button type="button" aria-label="Clear leaderboard search" onClick={()=>onSearch('')}><X size={16} aria-hidden="true"/></button>}
  </div>}
  {error&&<div className="ranked-recovery" role="alert"><h3>The standings are out of reach</h3><p>{error}</p><ActionButton onAction={onRetry}>Try again</ActionButton></div>}
  {!data&&loading&&<output className="action-status" role="status"><ActivityMark/>{search.trim()?'Searching standings…':'Loading standings…'}</output>}
  {data&&<>
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
   {!data.entries.length&&<p className="leaderboard-empty" role="status">{search.trim()?'No names match your search.':'No ranked results yet.'}<br/>{search.trim()?'Try another name or clear the search.':'Finish a ranked match to appear here.'}</p>}
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
