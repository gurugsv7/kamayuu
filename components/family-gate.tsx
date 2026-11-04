'use client';
import {useEffect,useState,type ReactNode} from 'react';
import {storedAge,rememberAge,beginParent,redeemParent,refreshFamily,familyError,type AgeBand} from '@/lib/family';
import {familyPermissions} from '@/lib/family-policy.mjs';
export default function FamilyGate({children}:{children:ReactNode}){
 const [age,setAge]=useState<AgeBand|null>(null),[ready,setReady]=useState(false),[session,setSession]=useState(''),[url,setUrl]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[solo,setSolo]=useState(false),[chosen,setChosen]=useState(false);
 useEffect(()=>{let live=true;void Promise.resolve().then(()=>{if(!live)return;const saved=storedAge();setAge(saved);if(saved&&saved!=='under_13')setReady(true);if(saved==='under_13')void refreshFamily().then(a=>{if(live&&a.age_band==='under_13'&&familyPermissions(a).online)setReady(true);}).catch(()=>{});setSession(localStorage.getItem('kamayuu-parent-session')||'');});return()=>{live=false;};},[]);
 async function choose(){if(!age)return;rememberAge(age);setChosen(true);if(age!=='under_13')setReady(true);}
 async function start(){setBusy(true);setError('');try{const result=await beginParent();setSession(result.session);setUrl(result.verificationUrl);localStorage.setItem('kamayuu-parent-session',result.session);}catch(e:unknown){setError(familyError(e));}finally{setBusy(false);}}
 async function check(){setBusy(true);setError('');try{await redeemParent(session);setReady(true);}catch(e:unknown){setError(familyError(e));}finally{setBusy(false);}}
 if(ready||solo)return <>{children}</>;
 return <main className="family-screen"><section className="family-card"><h1>Welcome to Kamayuu</h1>{(chosen&&age==='under_13')||storedAge()==='under_13'?<>
 <h2>Play online with parent approval</h2><p>Ask your parent or guardian to set up online play. You will use a game alias. Never share your real name, school, address or contact details with players.</p>
 <p>Your parent can turn online play, reactions and rematches on or off, and request deletion. Solo play is available without an online account.</p>
 <button disabled={busy} onClick={()=>void start()}>Parent or guardian: set up online play</button>
 {url&&<p><a href={url} target="_blank" rel="noopener noreferrer">Continue parent verification</a></p>}
 {session&&<button disabled={busy} onClick={()=>void check()}>Check parent approval</button>}
 <button onClick={()=>setSolo(true)}>Play solo on this device</button>
 </>:<><p>Select your age group. We use this to choose the right privacy settings. Your exact birthday is not needed.</p><label>Age group<select value={age||''} onChange={e=>setAge(e.target.value as AgeBand)}><option value="" disabled>Select an age group</option><option value="under_13">Under 13</option><option value="13_17">13–17</option><option value="18_plus">18 and above</option></select></label><button disabled={!age} onClick={()=>{void choose();if(age==='under_13')setAge('under_13');}}>Continue</button></>}
 {error&&<p role="alert">{error}</p>}<p><a href="/privacy.html" target="_blank" rel="noopener noreferrer">Privacy</a> · <a href="/parents.html" target="_blank" rel="noopener noreferrer">For parents</a></p></section></main>;
}
