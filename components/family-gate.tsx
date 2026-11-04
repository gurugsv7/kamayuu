'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {storedAge,rememberAge,type AgeBand} from '@/lib/family';
export default function FamilyGate({children}:{children:ReactNode}){
 const [age,setAge]=useState<AgeBand|null>(null),[ready,setReady]=useState(false);
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(live){const saved=storedAge();setAge(saved);setReady(!!saved);}});return()=>{live=false;};},[]);
 if(ready)return <>{children}</>;
 return <main className="family-screen"><section className="family-card"><h1>Welcome to Kamayuu</h1>
 <p>Select your age group. Your exact birthday is not needed.</p>
 <label>Age group<select value={age||''} onChange={e=>setAge(e.target.value as AgeBand)}><option value="" disabled>Select an age group</option><option value="under_13">Under 13</option><option value="13_17">13–17</option><option value="18_plus">18 and above</option></select></label>
 <p>Under 13? Enjoy practice on this device. Online play is available for ages 13 and above.</p>
 <button disabled={!age} onClick={()=>{if(age){rememberAge(age);setReady(true);}}}>Continue</button>
 <p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="/parents.html" target="_blank" rel="noopener noreferrer">For parents</a></p></section></main>;
}
