'use client';
import {useEffect,useState} from 'react';
import {RankedService,type RankedLeaderboard} from '@/lib/ranked';
export default function RankedLeaderboardView(){
 const [data,setData]=useState<RankedLeaderboard|null>(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;void new RankedService().leaderboard().then(x=>{if(live)setData(x);}).catch(e=>{if(live)setError(e.message);});return()=>{live=false;};},[]);
 return <div className="rules-content leaderboard-content">{error?<p role="alert">{error} Open Ranked 1v1 to finish setup.</p>:!data?<p>Loading standings…</p>:<><p>{data.season} · {data.total} entries. AI rivals use fixed benchmark ratings; player ratings change with results.</p>{data.entries.map(entry=><div className="rule" key={entry.entry_id}><b>{entry.rank}</b><p><strong>{entry.name}</strong> — {entry.rating} rating · {entry.wins} wins / {entry.played} played</p></div>)}{!data.entries.length&&<p>No standings yet.</p>}</>}</div>;
}
