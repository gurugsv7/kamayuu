'use client';
import {useRef,useState,type FormEvent} from 'react';
import {ArrowLeft,Eye,EyeOff,Mail,LockKeyhole} from 'lucide-react';

export default function ReviewerSignIn({onBack,onSignIn}:{onBack:()=>void;onSignIn:(email:string,password:string)=>Promise<void>}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const submitting=useRef(false);
 async function submit(e:FormEvent){
  e.preventDefault();if(submitting.current)return;
  submitting.current=true;setBusy(true);setError('');
  try{await onSignIn(email.trim(),password);setPassword('');}
  catch(e){setError(e instanceof Error?e.message:'Sign-in failed. Please try again.');}
  finally{submitting.current=false;setBusy(false);}
 }
 return <section className="reviewer-signin" aria-label="Reviewer sign-in">
  <div className="reviewer-signin-sheet">
   <button className="reviewer-back" type="button" disabled={busy} onClick={onBack}><ArrowLeft size={18}/>Back to sign in</button>
   <img src="/brand/kamayuu-emblem.png" width={84} height={84} alt="Kamayuu"/>
   <h1>Reviewer sign-in</h1><div className="reviewer-divider" aria-hidden="true">✧</div>
   <p>Use the account provided for app review.</p>
   <form onSubmit={submit} aria-busy={busy}>
    <label htmlFor="reviewer-email">Email</label>
    <div className="reviewer-field"><Mail size={19} aria-hidden="true"/><input id="reviewer-email" type="email" autoComplete="username" autoCapitalize="none" spellCheck={false} required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy}/></div>
    <label htmlFor="reviewer-password">Password</label>
    <div className="reviewer-field"><LockKeyhole size={19} aria-hidden="true"/><input id="reviewer-password" type={visible?'text':'password'} autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)} disabled={busy} aria-describedby={error?'reviewer-error':undefined}/><button type="button" aria-label={visible?'Hide password':'Show password'} aria-pressed={visible} onClick={()=>setVisible(v=>!v)} disabled={busy}>{visible?<EyeOff size={19}/>:<Eye size={19}/>}</button></div>
    {error&&<p id="reviewer-error" className="reviewer-error" role="alert">{error}</p>}
    <button className="reviewer-submit" type="submit" disabled={busy}>{busy&&<span className="activity-mark" aria-hidden="true"/>}{busy?'Signing in…':'Sign in'}</button>
    <span className="sr-only" role="status">{busy?'Signing in. Please wait.':''}</span>
   </form>
   <footer>Same game. Standard player access.</footer>
  </div>
 </section>;
}
