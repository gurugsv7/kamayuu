'use client';
import {useState,useRef,useEffect,useCallback,memo} from 'react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Switch} from '@/components/ui/switch';
import {Settings,BookOpen,Volume2,VolumeX,RotateCcw} from 'lucide-react';
import {createGame,transition,chooseAction,chooseReaction,aiView,canTakeDiscard,positionName,NAMES,value,label} from '@/lib/engine.mjs';
import {TableAudio} from '@/lib/audio.mjs';
import {MultiplayerService} from '@/lib/multiplayer';
import {NAME_LIMIT,avatarForBadge,currentSession,isGuest,loadProfile,saveProfile,signInAsGuest,signInWithGoogle,signOut,supabaseConfigured,type Profile} from '@/lib/account';
import {googleConfigured} from '@/lib/google-auth';
import OnboardingScreen from '@/components/onboarding-screen';
import PlayerIdentityScreen, { type PlayerIdentityData } from '@/components/player-identity-screen';
import HomeScreen from '@/components/home-screen';
import LoadingScreen,{KAMAYUU_CYCLE_MS} from '@/components/loading-screen';
const PRELOAD_IMAGES=['/onboarding-bg.webp','/onboarding-identity-bg.webp','/card-art-quickmatch.png','/card-art-privatetable.png','/card-art-practice.png'];
const LOTUS='<svg viewBox="0 0 80 64" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M40 49C22 39 27 21 40 9c13 12 18 30 0 40Z"/><path d="M40 49C18 50 9 33 9 23c19 0 28 10 31 26ZM40 49c22 1 31-16 31-26-19 0-28 10-31 26Z"/><path d="M40 49C23 60 9 49 3 39c14-5 25-1 37 10Zm0 0c17 11 31 0 37-10-14-5-25-1-37 10Z"/><path d="M40 19v23M24 57h32"/></svg>';
function Lotus(){return <span className="lotus" dangerouslySetInnerHTML={{__html:LOTUS}}/>}
const SUIT_FILE:Record<string,string>={'♠':'S','♥':'H','♣':'C','♦':'D'};
const RANK_FILE=['A','2','3','4','5','6','7','8','9','T','J','Q','K'];
const cardSrc=(c:any)=>`/cards/${c.rank==='10'?'T':c.rank}${SUIT_FILE[c.suit]}.svg`;
// A flaky connection (mobile data, a dropped wifi handoff) can fail this fetch with
// nothing else ever retrying it, leaving a permanently blank white card for the rest
// of the match. The inline onerror retries with backoff since this markup is injected
// via dangerouslySetInnerHTML, so a React onError handler never gets attached.
const CARD_RETRY="var n=+(this.dataset.n||0);if(n<6){this.dataset.n=n+1;var s=this.getAttribute('src').split('?')[0];var self=this;setTimeout(function(){self.src=s+'?r='+Date.now();},500*(n+1));}";
function cardHTML(c:any=null){return c&&c.rank?`<div class="playing-card face ${['♥','♦'].includes(c.suit)?'red':''}"><img class="card-art" src="${cardSrc(c)}" alt="" draggable="false" onerror="${CARD_RETRY}">${value(c)===0?'<em class="zero">ZERO</em>':''}</div>`:`<div class="playing-card back"></div>`;}
const Card=memo(function Card({card=null,empty=false,rev=0}:any){return <div key={rev} className="card-content" dangerouslySetInnerHTML={{__html:empty?'':cardHTML(card)}}/>});
const seatName=(p:number,st:any)=>st?.players?.[p]?.name||NAMES[p];
const deckSize=(st:any)=>st?(st.remote?st.deckCount??0:st.deck.length):35;
const takeable=(st:any)=>st?(st.remote?!!st.canTakeDiscard:canTakeDiscard(st,0)):false;
const defaults={players:4,difficulty:'medium',sound:true,haptics:true,motion:false};
export default function Home(){
 const [settings,setSettings]=useState(defaults),[stats,setStats]=useState({played:0,won:0}),[hydrated,setHydrated]=useState(false),[menu,setMenu]=useState(true),[panel,setPanel]=useState<string|null>(null);
 const [lobby,setLobby]=useState<any>(null),[connection,setConnection]=useState(''),[presence,setPresence]=useState<string[]>([]),[joinCode,setJoinCode]=useState(''),[playerName,setPlayerName]=useState(''),[online,setOnline]=useState<string|null>(null),[clock,setClock]=useState<number|null>(null),[joinError,setJoinError]=useState('');
 const [gate,setGate]=useState<'loading'|'signin'|'onboarding'|'ready'>('loading'),[profile,setProfile]=useState<Profile|null>(null),[guest,setGuest]=useState(false);
 const [assetProgress,setAssetProgress]=useState(0),[assetsDone,setAssetsDone]=useState(false),[minTimeElapsed,setMinTimeElapsed]=useState(false);
 const [authError,setAuthError]=useState(''),[authBusy,setAuthBusy]=useState(''),[draftName,setDraftName]=useState(''),[draftAvatar,setDraftAvatar]=useState('lotus'),[identityFrom,setIdentityFrom]=useState<'signin'|'ready'>('signin');
 const [s,setS]=useState<any>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState('Less in your hand. More on your mind.'),[caption,setCaption]=useState('A GAME OF MEMORY & NERVE'),[revision,setRevision]=useState(0),[target,setTarget]=useState<number|null>(null),[swapSlot,setSwapSlot]=useState<number|null>(null),[memory,setMemory]=useState(false),[result,setResult]=useState(false),[countdown,setCountdown]=useState<number|null>(null),[queued,setQueued]=useState(false),[wake,setWake]=useState(0),[announce,setAnnounce]=useState<string|null>(null);
 const [emote,setEmote]=useState<{player:number;token:number}|null>(null);
 const remote=useRef<any>(null),queue=useRef<Promise<void>>(Promise.resolve()),lobbyRef=useRef<any>(null),game=useRef<any>(null),locked=useRef(false),epoch=useRef(0),config=useRef(settings),audio=useRef<any>(null),table=useRef<HTMLElement|null>(null),animations=useRef<Set<Animation>>(new Set()),activeAbort=useRef(new AbortController()),mounted=useRef(true),paused=useRef(false),qaHold=useRef(false),memorized=useRef(false),packetHandler=useRef<(p:any)=>void>(()=>{}),queuedMatch=useRef<any>(null),observedDiscard=useRef<string|null>(null),movingSlots=useRef(new Set<string>()),motionTarget=useRef<any>(null),announceTimer=useRef<any>(null),emoteTimer=useRef<any>(null),emoteToken=useRef(0);
 useEffect(()=>{mounted.current=true;if(activeAbort.current.signal.aborted)activeAbort.current=new AbortController();audio.current=new TableAudio();for(const r of RANK_FILE)for(const u of ['S','H','C','D'])new Image().src=`/cards/${r}${u}.svg`;new Image().src='/cards/back.png';new Image().src='/haha-emote-sprite.png';new Image().src='/emotes-icon.png';try{const stored=JSON.parse(localStorage.getItem('lotus-settings')||'null');if(stored)setSettings({...defaults,...stored});const st=JSON.parse(localStorage.getItem('lotus-stats')||'null');if(st)setStats(st);setPlayerName(localStorage.getItem('lotus-name')||'');}catch{}setHydrated(true);return()=>{mounted.current=false;clearTimeout(announceTimer.current);clearTimeout(emoteTimer.current);activeAbort.current.abort();animations.current.forEach(a=>a.cancel());audio.current?.ctx?.close();};},[]);
 // Preloads every image the onboarding/identity/home screens paint, so the
 // loading screen's progress bar reflects real work — not a fake timer. A
 // 404 on any one image still counts as settled, and an 8s hard timeout
 // guarantees the loader can never hang forever on a slow or dead asset.
 useEffect(()=>{let settled=false,done=0;const total=PRELOAD_IMAGES.length;
  const finish=()=>{if(settled)return;settled=true;setAssetProgress(100);setAssetsDone(true);};
  const bump=()=>{done++;setAssetProgress(Math.round(done/total*100));if(done>=total)finish();};
  for(const src of PRELOAD_IMAGES){const img=new Image();img.onload=bump;img.onerror=bump;img.src=src;}
  const hardTimeout=setTimeout(finish,8000);
  return()=>clearTimeout(hardTimeout);
 },[]);
 // Keeps the loader up for one full lotus draw-in even when assets settle
 // almost instantly, so the animation never gets cut mid-petal — this is a
 // floor, not a ceiling, so a slow load is never held up any further than the
 // asset/auth gates already require. prefers-reduced-motion bypasses the
 // floor outright (that user asked for less motion, not a longer wait), and
 // the duration scales with settings.motion exactly like the CSS does via
 // --motion-scale, so a short-motion session isn't stuck waiting on a
 // full-length animation that isn't actually playing.
 useEffect(()=>{
  const reduced=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  if(reduced){setMinTimeElapsed(true);return;}
  const t=setTimeout(()=>setMinTimeElapsed(true),KAMAYUU_CYCLE_MS*(settings.motion?0.65:1));
  return()=>clearTimeout(t);
 },[settings.motion]);
 // Decide up front whether we need the sign-in screen, onboarding, or neither.
 useEffect(()=>{let live=true;
  (async()=>{
   const seenOnboarding = localStorage.getItem('lotus-onboarded');
   if(!supabaseConfigured()){
     if(live){
       if(!seenOnboarding) setGate('signin');
       else { setGuest(true); setGate('ready'); }
     }
     return;
   }
   try{
    const session=await currentSession();
    if(!session){if(live)setGate('signin');return;}
    if(live)setGuest(isGuest(session));
    const existing=await loadProfile();
    if(!live)return;
    if(!existing){setDraftName(localStorage.getItem('lotus-name')||'');setIdentityFrom('signin');setGate('onboarding');return;}
    setProfile(existing);setPlayerName(existing.display_name);setGate('ready');
   }catch{if(live)setGate('signin');}
  })();
  return()=>{live=false;};
 },[]);
 // Nothing is written back until the stored settings have been read, or the
 // first render would overwrite them with the defaults.
 useEffect(()=>{config.current=settings;if(audio.current){audio.current.enabled=settings.sound;audio.current.haptics=settings.haptics;}if(!hydrated)return;try{localStorage.setItem('lotus-settings',JSON.stringify(settings));}catch{}},[settings,hydrated]);
 async function handleGoogleSuccess(token:string,nonce:string){
  setAuthBusy('Signing in…');setAuthError('');
  try{
   localStorage.setItem('lotus-onboarded','true');
   const session=await signInWithGoogle(token,nonce);
   setGuest(isGuest(session));
   const existing=await loadProfile();
   if(existing){setProfile(existing);setPlayerName(existing.display_name);setGate('ready');}
   else{setDraftName((session?.user?.user_metadata?.name||'').slice(0,NAME_LIMIT));setIdentityFrom('signin');setGate('onboarding');}
  }catch(err:any){setAuthError(err?.message||'Google sign-in failed.');}
  finally{setAuthBusy('');}
 }
 async function handleGoogleClick(){
  if(!googleConfigured()){setAuthError('Google sign-in is not configured yet.');return;}
  setAuthBusy('Opening Google Sign-In…');
  setTimeout(()=>setAuthBusy(''),1200);
 }
 useEffect(()=>{paused.current=!!panel;},[panel]);
 useEffect(()=>{const visibility=()=>{for(const a of animations.current)if(document.hidden)a.pause();else a.play();};document.addEventListener('visibilitychange',visibility);return()=>document.removeEventListener('visibilitychange',visibility);},[]);
 function el(loc:string){const e=table.current?.querySelector(`[data-loc="${loc}"]`) as HTMLElement;if(!e)throw Error('Missing card location '+loc);return e;}
 function content(loc:string){return el(loc).querySelector('.card-content') as HTMLElement;}
 function put(loc:string,c:any=null,empty=false){if(loc==='discard')observedDiscard.current=empty?null:c?.id||null;const e=content(loc);e.style.visibility='visible';e.innerHTML=empty?'':cardHTML(c);}
 function hide(loc:string){if(loc==='discard')observedDiscard.current=null;content(loc).style.visibility='hidden';}
 function sound(k:string,p=0){audio.current?.play(k,p===1?-1:p===3?1:0);}
 function check(token:number){if(token!==epoch.current||!mounted.current)throw new DOMException('Cancelled','AbortError');}
 async function wait(ms:number,token:number){const signal=activeAbort.current.signal;let remaining=ms;while(remaining>0){check(token);const step=Math.min(remaining,60);await new Promise<void>((resolve,reject)=>{const abort=()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},step);signal.addEventListener('abort',abort,{once:true});});if(!document.hidden&&!paused.current)remaining-=step;}check(token);}
 async function animate(node:HTMLElement,frames:Keyframe[],duration:number,token:number){check(token);const a=node.animate(frames,{duration:duration*(config.current.motion?.65:1),easing:'cubic-bezier(.22,.7,.25,1)',fill:'forwards'});animations.current.add(a);if(document.hidden)a.pause();const abort=()=>a.cancel();activeAbort.current.signal.addEventListener('abort',abort,{once:true});try{await a.finished;check(token);}finally{animations.current.delete(a);activeAbort.current.signal.removeEventListener('abort',abort);a.cancel();}}
 async function flip(loc:string,c:any,token:number,hideAgain=false,privatePeek=false){const host=content(loc);sound('flip');await animate(host,[{transform:'translateY(0) rotateY(0)'},{transform:'translateY(-7px) rotateY(90deg)'}],150,token);put(loc,c);await animate(host,[{transform:'translateY(-7px) rotateY(-90deg)'},{transform:'translateY(-5px) rotateY(0)'}],180,token);if(hideAgain){await wait(privatePeek?1500:500,token);await flip(loc,null,token);}}
 async function fly(from:string,to:string,c:any,token:number,duration=550,arc=0,remove=true){
  check(token);const a=el(from).getBoundingClientRect(),b=el(to).getBoundingClientRect();if(remove)hide(from);const node=document.createElement('div');node.className='flying-card';node.setAttribute('aria-hidden','true');node.innerHTML=cardHTML(c);Object.assign(node.style,{position:'fixed',left:a.left+'px',top:a.top+'px',width:a.width+'px',height:a.height+'px',zIndex:'80',pointerEvents:'none',transformOrigin:'0 0'});document.body.appendChild(node);
  const dx=b.left-a.left,dy=b.top-a.top,sx=b.width/a.width,sy=b.height/a.height;
  sound('slide');try{await animate(node,[{transform:'translate(0,0) rotate(0deg) scale(1)',filter:'drop-shadow(0 3px 3px #0008)'},{transform:`translate(${dx*.47+arc}px,${dy*.47-27}px) rotate(${arc?Math.sign(arc)*9:-5}deg) scale(${(1+sx)/2},${(1+sy)/2})`,filter:'drop-shadow(0 20px 13px #000a)',offset:.48},{transform:`translate(${dx}px,${dy}px) rotate(0deg) scale(${sx},${sy})`,filter:'drop-shadow(0 4px 4px #0009)'}],duration,token);put(to,c);sound('impact');}finally{node.remove();}}
 function commit(next:any){observedDiscard.current=next.discard.at(-1)?.id||null;game.current=next;setS(next);setRevision(v=>v+1);}
 function neutralPrompt(state:any){if(state.phase==='finished'||state.phase==='memory')return;if(state.phase==='lastCall'){setCaption('LAST CHANCE TO MATCH');setMessage('Throw a match before the final reveal.');return;}if(state.players[0].eliminated){setCaption('YOU’RE OUT · WATCH THE TABLE');setMessage(`${seatName(state.active,state)}’s turn. Six cards ended your hand.`);return;}if(state.phase==='swapConfirm'&&state.active===0&&state.pending){setCaption('TRADE OR KEEP');setMessage(`Your ${positionName(state.pending.i)} against ${seatName(state.pending.target,state)}’s. Trade, or keep yours.`);return;}const you=state.active===0;setCaption(state.caller!==null?`FINAL ROUND · ${state.remaining.map((p:number)=>seatName(p,state)).join(' · ')}`:you?'YOUR TURN':`${seatName(state.active,state).toUpperCase()}’S TURN`);
 const messages:any={ready:you?(state.discard.length&&!takeable(state)?'You threw this discard. Draw from the deck.':'Draw, take the discard, or throw a match.'):'You can throw a match during this turn.',decision:you?'Tap a card to replace it.':'Considering the draw.',peek:you?'Jack — peek at one of your cards.':'A private peek.',swap:you?'Red Queen — pick one of your cards, then an opponent.':'A same-position exchange.',swapConfirm:you?'Trade the two cards, or keep yours.':'Weighing the exchange.'};setMessage(messages[state.phase]||'');}
 function cancel(){epoch.current++;activeAbort.current.abort();activeAbort.current=new AbortController();animations.current.forEach(a=>a.cancel());animations.current.clear();document.querySelectorAll('.flying-card').forEach(e=>e.remove());locked.current=false;setBusy(false);setMemory(false);setTarget(null);setResult(false);setCountdown(null);setSwapSlot(null);queuedMatch.current=null;setQueued(false);movingSlots.current.clear();motionTarget.current=null;clearTimeout(emoteTimer.current);setEmote(null);}
 async function start(override?:{players?:number;difficulty?:string}){cancel();if(remote.current){try{remote.current.close();}catch{}remote.current=null;setLobby(null);lobbyRef.current=null;setOnline(null);setPresence([]);setConnection('');setClock(null);}memorized.current=false;audio.current?.unlock();setMenu(false);setPanel(null);const token=epoch.current;locked.current=true;setBusy(true);const {state,events}=createGame({...config.current,...override});commit(state);setCaption('THE LANTERN TABLE');setMessage('A fresh hand. A clean slate.');await paint();
 try{check(token);for(let p=0;p<state.players.length;p++)for(let i=0;i<4;i++)put(`p${p}-${i}`,null,true);put('discard',null,true);for(const e of events){if(e.type==='deal'){await fly('deck',`p${e.p}-${e.i}`,null,token,105,0,false);sound('deal',e.p);}else await fly('deck','discard',e.card,token,360,0,false);}
 setCountdown(null);setMemory(true);setCaption('MEMORIZE THESE TWO');setMessage('Remember your bottom two cards.');await Promise.all([flip('p0-2',state.players[0].slots[2],token),flip('p0-3',state.players[0].slots[3],token)]);for(let n=7;n>0;n--){setCountdown(n);await wait(1000,token);}setCountdown(0);await Promise.all([flip('p0-2',null,token),flip('p0-3',null,token)]);setMemory(false);const next=transition(state,{type:'remember'}).state;commit(next);neutralPrompt(next);try{localStorage.setItem('lotus-tutorial','complete');}catch{}}
 catch(err:any){if(err.name!=='AbortError'){console.error(err);setMessage('The deal was interrupted. Start a new match.');}}finally{if(token===epoch.current){locked.current=false;setBusy(false);}}}
 // A short spoken-aloud line for table-wide moments, so a buzz is not sound-only.
 function flash(text:string){setAnnounce(text);clearTimeout(announceTimer.current);announceTimer.current=setTimeout(()=>setAnnounce(null),2200);}
 // Plays the haha emote over a board. `p` is already rotated to the viewer's own seating.
 function playEmote(p:number){const token=++emoteToken.current;setEmote({player:p,token});clearTimeout(emoteTimer.current);emoteTimer.current=setTimeout(()=>{if(emoteToken.current===token)setEmote(null);},3000);}
 function sendEmote(){audio.current?.unlock();if(game.current?.remote){sendCommand('emote');return;}playEmote(0);}
 async function eventsPlay(events:any[],before:any,next:any,token:number){for(const e of events){check(token);const pos=`p${e.p}-${e.i}`,name=seatName(e.p,before);
 if(e.type==='deal'){await fly('deck',pos,null,token,105,0,false);sound('deal',e.p);}
 else if(e.type==='firstDiscard'){await fly('deck','discard',e.card,token,360,0,false);}
 else if(e.type==='memoryEnd'){setMemory(false);setCountdown(null);}
 else
 if(e.type==='draw'||e.type==='take'){setMessage(e.type==='take'?`${name} takes the public discard.`:e.p===0?'A little luck. A little nerve.':`${name} draws privately.`);const face=e.p===0||e.type==='take'||e.public?e.card:null;await fly(e.type==='take'?'discard':'deck',`held${e.p}`,e.type==='take'?e.card:null,token,490,0,e.type==='take');if(e.type==='take'){put('discard',before.discard.at(-2)||null,before.discard.length<2);}else if(face)await flip(`held${e.p}`,face,token);if(e.public){sound(e.card.rank==='J'?'peek':'swap');await wait(300,token);}}
 else if(e.type==='replace'){setMessage(`${name} risks ${positionName(e.i)}.`);el(pos).classList.add('destination');await fly(pos,`reveal${e.p}`,null,token,340);await flip(`reveal${e.p}`,e.old,token);if(value(e.old)===0){setMessage('A zero King. Left on the table.');sound('zero');await wait(700,token);}else await wait(290,token);
 await fly(`held${e.p}`,pos,e.p===0||e.public?e.card:null,token,620,e.p===1?-14:14);if(e.p===0||e.public)await flip(pos,null,token);await fly(`reveal${e.p}`,'discard',e.old,token,570);el(pos).classList.remove('destination');}
 else if(e.type==='discard'){await flip(`held${e.p}`,e.card,token);await fly(`held${e.p}`,'discard',e.card,token,420);}
 else if(e.type==='match'){setMessage(`${name} throws ${positionName(e.i)}.`);await fly(pos,`reveal${e.p}`,null,token,220);await flip(`reveal${e.p}`,e.card,token);await wait(260,token);if(e.ok){await fly(`reveal${e.p}`,'discard',e.card,token,320);put(pos,null,true);sound('success');setMessage('A perfect match. One less card.');}else{sound('fail');setMessage('Wrong match. Take your card back — and the discard.');await wait(550,token);await fly(`reveal${e.p}`,pos,e.card,token,490);await flip(pos,null,token);
 const penaltyLoc=`p${e.p}-${e.penaltyIndex}`;el(penaltyLoc).classList.add('destination');await fly('discard',penaltyLoc,e.penalty,token,630);put('discard',e.nextDiscard,!e.nextDiscard);await wait(450,token);await flip(penaltyLoc,null,token);el(penaltyLoc).classList.remove('destination');
 if(e.turnLost)setMessage(e.p===0?'Wrong match. The penalty is yours and your turn is spent.':`${name} misses and forfeits the turn.`);} await wait(330,token);}
 else if(e.type==='peek'){setMessage(e.p===0?'Only you can see this.':'A private peek. Watch which position.');el(pos).classList.add('destination');sound('peek',e.p);if(e.p===0)await flip(pos,e.card,token,true,true);else{await animate(content(pos),[{transform:'translateY(0) rotateX(0)'},{transform:'translateY(-10px) rotateX(-24deg)',offset:.4},{transform:'translateY(-10px) rotateX(-24deg)',offset:.8},{transform:'translateY(0) rotateX(0)'}],1250,token);}el(pos).classList.remove('destination');}
 else if(e.type==='inspect'){const dest=`p${e.target}-${e.i}`;el(pos).classList.add('destination');el(dest).classList.add('destination');sound('swap');
 // Only the Queen's owner sees the pair; everyone else just sees the pause.
 if(e.p===0){setCaption('PRIVATE QUEEN LOOK');setMessage(`Your ${positionName(e.i)} against ${seatName(e.target,before)}’s.`);await Promise.all([flip(pos,e.mine,token),flip(dest,e.theirs,token)]);}
 else{setMessage(`${name} weighs ${positionName(e.i)} against ${seatName(e.target,before)}.`);await wait(800,token);}}
 else if(e.type==='swapEnd'){const dest=`p${e.target}-${e.i}`;setMessage(`${name} keeps ${positionName(e.i)}. The Queen is spent.`);
 if(e.p===0)await Promise.all([flip(pos,null,token),flip(dest,null,token)]);else await wait(320,token);
 el(pos).classList.remove('destination');el(dest).classList.remove('destination');}
 else if(e.type==='swap'){const dest=`p${e.target}-${e.i}`;setMessage(`${name} ↔ ${seatName(e.target,before)} · ${positionName(e.i)}`);el(pos).classList.add('destination');el(dest).classList.add('destination');sound('swap');
 await wait(e.p===0?320:350,token);
 await Promise.all([fly(pos,dest,e.p===0?e.outgoing:null,token,1120,58),fly(dest,pos,e.p===0?e.incoming:null,token,1120,-58)]);
 if(e.p===0){await wait(650,token);await Promise.all([flip(pos,null,token),flip(dest,null,token)]);}el(pos).classList.remove('destination');el(dest).classList.remove('destination');await wait(400,token);} 
 else if(e.type==='reshuffle'){setMessage('The discards return to the deck.');await fly('discard','deck',null,token,600,0,false);put('discard',before.discard.at(-1));await wait(200,token);}
 else if(e.type==='buzz'){flash(`${e.p===0?'You':name} buzzed · final round`);setCaption('FINAL ROUND');setMessage(e.keepTurn?`${name} buzzed. ${e.p===0?'You still play this turn':'They still play this turn'} — then one last turn each.`:`${name} buzzed. Everyone else gets one last turn.`);sound('buzz');const buz=table.current?.querySelector('.buzzer') as HTMLElement;await animate(buz,[{transform:'translateY(0)'},{transform:'translateY(8px)',offset:.2},{transform:'translateY(-2px)',offset:.6},{transform:'translateY(0)'}],500,token);await wait(900,token);}
 else if(e.type==='emote'){playEmote(e.p);}
 else if(e.type==='pass'){flash(`${e.p===0?'You were':name+' was'} skipped`);setMessage(e.p===0?'You ran out of time. The turn moves on.':`${name} ran out of time. The turn moves on.`);sound('fail');await wait(800,token);}
 else if(e.type==='eliminate'){setCaption('SIX CARDS · OUT');setMessage(`${name} is out. The remaining players continue.`);sound('fail');await wait(1100,token);}
 else if(e.type==='lastCall'){setCaption('LAST CHANCE TO MATCH');setMessage('Throw a match before the final reveal.');}
 else if(e.type==='final'){setCaption('THE FINAL REVEAL');setMessage('The table tells the truth.');for(let p=0;p<next.players.length;p++){for(let i=0;i<next.players[p].slots.length;i++)if(next.players[p].slots[i]){await flip(`p${p}-${i}`,next.players[p].slots[i],token);sound(value(next.players[p].slots[i])===0?'zero':'flip',p);await wait(160,token);}await wait(330,token);}sound(next.winners.includes(0)?'win':'lose');await wait(650,token);setResult(true);setCaption(next.winners.includes(0)?'WELL PLAYED':'UNTIL THE NEXT HAND');setMessage(`${next.winners.map((p:number)=>seatName(p,next)).join(' & ')} ${next.winners.length>1?'share the win':'wins'}.`);setStats(old=>{const updated={played:old.played+1,won:old.won+(next.winners.includes(0)?1:0)};try{localStorage.setItem('lotus-stats',JSON.stringify(updated));}catch{}return updated;});}
 }}
 async function hold(ms:number,token:number){const until=Date.now()+ms;while(Date.now()<until){check(token);await new Promise(r=>setTimeout(r,60));}check(token);}
 function paint(){return new Promise<void>(done=>{const bail=setTimeout(done,150);requestAnimationFrame(()=>requestAnimationFrame(()=>{clearTimeout(bail);done();}));});}
 async function memorize(next:any,token:number,silent:boolean){
  setMemory(true);setCaption('MEMORIZE THESE TWO');setMessage('Remember your bottom two cards.');
  if(silent){put('p0-2',next.players[0].slots[2]);put('p0-3',next.players[0].slots[3]);}
  else await Promise.all([flip('p0-2',next.players[0].slots[2],token),flip('p0-3',next.players[0].slots[3],token)]);
  for(let n=7;n>0;n--){setCountdown(n);await (silent?hold(1000,token):wait(1000,token));}
  setCountdown(0);
  if(silent){put('p0-2',null);put('p0-3',null);}
  else await Promise.all([flip('p0-2',null,token),flip('p0-3',null,token)]);
  setMemory(false);
  try{await remote.current?.command('remember');}catch{}
 }
 async function playPacket(packet:any){
  const next=packet.state,before=game.current;
  if(!next){cancel();game.current=null;setS(null);setMemory(false);memorized.current=false;return;}
  const opening=packet.events.some((e:any)=>e.type==='deal');
  // A recovery packet is a full truth refresh: repaint, never replay. A hidden tab
  // cannot animate at all — the document timeline is frozen — so it applies the
  // state directly rather than stalling the queue until the player comes back.
  const resync=packet.recover||!before,silent=document.hidden;
  const token=epoch.current;locked.current=true;setBusy(true);setMenu(false);
  try{
   if(opening){memorized.current=false;setCaption('THE LANTERN TABLE');setMessage('A fresh hand. A clean slate.');}
   if(silent||resync||!packet.events.length)commit(next);
   else{
    if(opening){
     commit(next);await paint();check(token);
     for(let q=0;q<next.players.length;q++)for(let i=0;i<next.players[q].slots.length;i++)put(`p${q}-${i}`,null,true);
     put('discard',null,true);
    }
    await eventsPlay(packet.events,before||next,next,token);check(token);commit(next);
   }
   if(next.phase==='memory'&&!memorized.current){memorized.current=true;await memorize(next,token,silent);}
   else neutralPrompt(next);
  }catch(err:any){if(err.name!=='AbortError'){console.error(err);commit(next);neutralPrompt(next);}}
  finally{if(token===epoch.current){locked.current=false;setBusy(false);}}
 }
 packetHandler.current=(packet:any)=>{
  lobbyRef.current=packet.room;setLobby(packet.room);setJoinError('');
  if(packet.recover){cancel();queue.current=Promise.resolve();}
  queue.current=queue.current.then(()=>playPacket(packet)).catch(()=>{});
 };
 async function continueAsGuest(){
  setAuthBusy('Setting up…');setAuthError('');
  try{localStorage.setItem('lotus-onboarded','true');}catch{}
  try{
   const session=await signInAsGuest();setGuest(isGuest(session));
   setDraftName(localStorage.getItem('lotus-name')||'');setIdentityFrom('signin');setGate('onboarding');
  }catch(err:any){
   // Solo play must never be blocked by an auth or network failure.
   setAuthError((err?.message||'Could not start a guest session.')+' You can still play solo.');
   setGuest(true);setDraftName(localStorage.getItem('lotus-name')||'');setIdentityFrom('signin');setGate('onboarding');
  }finally{setAuthBusy('');}
 }
 async function finishOnboarding(identity?: PlayerIdentityData){
  const name=(identity?.name||draftName).trim().slice(0,NAME_LIMIT)||'Guru';
  const badge=identity?.badge??draftAvatar??'compass';
  const country=identity?.country||'';
  const photo=identity?.photo||'';
  setAuthBusy('Saving…');setAuthError('');
  try{
   localStorage.setItem('lotus-name',name);
   if(country) localStorage.setItem('lotus-country',country);
   localStorage.setItem('lotus-badge',badge);
   if(photo) localStorage.setItem('lotus-avatar-photo',photo);
  }catch{}
  setPlayerName(name);
  try{
   const saved=await saveProfile(name,avatarForBadge(badge));
   setProfile(saved);
  }catch(err:any){
   // No account (offline guest) simply means the name lives on this device only.
   setAuthError(err?.message?'Saved on this device only — '+err.message:'');
  }finally{setAuthBusy('');setGate('ready');}
 }
 async function leaveAccount(){
  if(remote.current){try{await remote.current.close();}catch{}remote.current=null;}
  await signOut();
  setProfile(null);setGuest(false);setLobby(null);lobbyRef.current=null;setOnline(null);
  setPanel(null);setMenu(true);setGate('signin');
 }
 async function connect(command:'create'|'join'|'recover',extra:any={}){
  cancel();setJoinError('');setOnline('connecting');setConnection('Connecting…');
  // Any previous table is torn down first: its channels and its room id would
  // otherwise follow this connection into the new room.
  if(remote.current){try{await remote.current.close();}catch{}remote.current=null;}
  game.current=null;setS(null);setLobby(null);lobbyRef.current=null;setPresence([]);memorized.current=false;
  queue.current=Promise.resolve();
  try{
   audio.current?.unlock();
   remote.current=new MultiplayerService((pk:any)=>packetHandler.current(pk),setConnection,setPresence);
   await remote.current.enter(command,extra);
   setOnline('room');setPanel(null);setMenu(false);
  }catch(err:any){
   try{await remote.current?.close();}catch{}
   remote.current=null;setOnline(null);setConnection('');setPanel('online');setJoinError(err?.message||'Could not reach the table.');
  }
 }
 async function sendCommand(command:string,extra:any={}){try{await remote.current?.command(command,extra);}catch(err:any){setJoinError(err?.message||'That did not reach the table.');}}
 async function leaveOnline(){
  // Tear the table down before telling the server. The notify is a network call
  // that can hang on a bad connection, and awaiting it first left the button
  // looking dead at the one moment a player is already trying to get out.
  const service=remote.current;
  remote.current=null;cancel();memorized.current=false;
  game.current=null;setS(null);setLobby(null);lobbyRef.current=null;setOnline(null);setPresence([]);setConnection('');setClock(null);setMenu(true);
  // Still release the seat, and the membership behind it, in the background.
  try{await service?.leave();}catch{}
  try{await service?.close();}catch{}
 }
 const act=useCallback(async(action:any,ai=false)=>{
 const before=game.current;if(locked.current||!before||['finished','memory'].includes(before.phase)||paused.current||(!ai&&before.players[0].eliminated)||(!ai&&!['match','buzz'].includes(action.type)&&before.active!==0)||(!ai&&action.type==='finish'))return false;
 if(before.remote){
  setTarget(null);setSwapSlot(null);audio.current?.unlock();
  try{await remote.current?.action(action);return true;}
  catch(err:any){setMessage(err?.message||'That did not reach the table.');return false;}
 }
 if(['match','buzz'].includes(action.type)&&!ai)action={...action,player:0};let plan:any;try{plan=transition(before,action);}catch{return false;}
 const token=epoch.current;locked.current=true;motionTarget.current=plan.state;setBusy(true);setTarget(null);setSwapSlot(null);audio.current?.unlock();movingSlots.current.clear();
 for(const e of plan.events){if(['replace','match','peek','swap','inspect','swapEnd'].includes(e.type))movingSlots.current.add(`p${e.p}-${e.i}`);if(['swap','inspect','swapEnd'].includes(e.type))movingSlots.current.add(`p${e.target}-${e.i}`);}
 try{await eventsPlay(plan.events,before,plan.state,token);check(token);commit(plan.state);neutralPrompt(plan.state);return true;}
 catch(err:any){if(err.name!=='AbortError'){console.error(err);setMessage('The action was interrupted. Open settings to restart.');}return false;}
 finally{if(token===epoch.current){locked.current=false;motionTarget.current=null;movingSlots.current.clear();setBusy(false);const pending=queuedMatch.current;queuedMatch.current=null;setQueued(false);if(pending){const accepted=await act(pending);if(!accepted)setMessage('The discard moved. Choose a match for the new top card.');}}}
 },[]);
 function chooseSwap(slot:number|null,opponent:number|null){
  setSwapSlot(slot);setTarget(opponent);const cur=game.current;if(!cur)return;
  if(slot!==null&&opponent!==null&&cur.players[0].slots[slot]&&cur.players[opponent].slots[slot]){act({type:'inspect',target:opponent,i:slot});return;}
  setMessage(slot===null?'Pick one of your own four cards.':opponent===null?`Your ${positionName(slot)} is set — now pick an opponent.`:`${seatName(opponent,cur)} has nothing in ${positionName(slot)}. Pick another position.`);
 }
 function requestMatch(i:number){const current=game.current;if(!current||current.players[0].eliminated||['memory','finished'].includes(current.phase)||(current.active===0&&current.held)||!current.players[0].slots[i]||!observedDiscard.current||paused.current||motionTarget.current?.phase==='finished')return;
 // The engine refuses a penalty thrown back onto the card it just uncovered. Say so
 // here rather than letting the tap look like it did nothing.
 const lock=current.players[0].locked;
 if(lock&&lock.card===current.players[0].slots[i]?.id&&lock.against===current.discard.at(-1)?.id){setMessage('That penalty cannot go straight back. Wait for a new discard.');return;}
 const loc=`p0-${i}`;if(movingSlots.current.has(loc)||content(loc).style.visibility==='hidden')return;
 const action={type:'match',player:0,i,expectedDiscard:observedDiscard.current,expectedCard:current.players[0].slots[i].id};
 if(locked.current){if(!queuedMatch.current){queuedMatch.current=action;setQueued(true);}}else act(action);
 }
 useEffect(()=>{if(qaHold.current||!s||s.remote||busy||menu||panel||['finished','memory'].includes(s.phase))return;
 const reactions=s.players.flatMap((_:any,p:number)=>p>0?[chooseReaction(aiView(s,p))].filter(Boolean):[]);
 const reaction=reactions.length?reactions[(s.turn+s.discard.length)%reactions.length]:null;
 if(!reaction&&s.active===0&&s.phase!=='lastCall')return;
 const delay=reaction?({easy:2400,medium:1900,hard:1500}[s.difficulty as string]||1900):s.phase==='lastCall'?2200:950;
 const id=setTimeout(()=>{const current=game.current;if(!current||document.hidden||locked.current||paused.current||['finished','memory'].includes(current.phase))return;act(reaction||chooseAction(aiView(current)),true);},delay);return()=>clearTimeout(id);
 },[s,busy,menu,panel,act,wake]);
 useEffect(()=>{
  if(!lobby?.deadline||!s||s.phase==='finished'){setClock(null);return;}
  const skew=(lobby.serverTime||Date.now())-Date.now();
  const tick=()=>setClock(Math.max(0,Math.round((lobby.deadline-(Date.now()+skew))/1000)));
  tick();const id=setInterval(tick,500);return()=>clearInterval(id);
 },[lobby,s]);
 useEffect(()=>()=>{remote.current?.close();},[]);
 useEffect(()=>{const resume=()=>{if(!document.hidden)setWake(v=>v+1);};document.addEventListener('visibilitychange',resume);return()=>document.removeEventListener('visibilitychange',resume);},[]);
 useEffect(()=>{const ctx=(document as any).modelContext;if(!ctx?.registerTool)return;const lifecycle=new AbortController();try{Promise.resolve(ctx.registerTool({name:'play_table_action',description:'Perform one legal human action at the Kamayuu table. Hidden card identities are never returned.',inputSchema:{type:'object',properties:{type:{type:'string',enum:['draw','take','match','replace','discard','peek','inspect','swap','skip','buzz']},i:{type:'integer',minimum:0,maximum:51},target:{type:'integer',minimum:1,maximum:3}},required:['type'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute:async(input:any)=>{if(!input||!['draw','take','match','replace','discard','peek','inspect','swap','skip','buzz'].includes(input.type))throw Error('Invalid action');const ok=await act(input);if(!ok)throw Error('Action is unavailable');return {phase:game.current.phase,active:seatName(game.current.active,game.current),counts:game.current.players.map((p:any)=>p.slots.filter(Boolean).length)};}},{signal:lifecycle.signal})).catch(()=>{});}catch{}return()=>lifecycle.abort();},[act]);
 useEffect(()=>{if(process.env.NODE_ENV!=='production'){(window as any).__lotusQA={state:()=>structuredClone(game.current),busy:()=>locked.current,load:(state:any,hold=true)=>{cancel();qaHold.current=hold;setMenu(false);setPanel(null);commit(state);neutralPrompt(state);},act:(a:any)=>act(a,true),release:()=>{qaHold.current=false;setRevision(v=>v+1);},online:async(seats=3)=>{const {LocalTable}=await import('@/lib/local-table.mjs');cancel();memorized.current=false;remote.current=new LocalTable(seats,(pk:any)=>packetHandler.current(pk),setConnection,setPresence,['You','Kai','Rin','Mira']);setOnline('room');setMenu(false);setPanel(null);await remote.current.enter();return remote.current.room;},table:()=>remote.current?.record?.data};return()=>{delete (window as any).__lotusQA;};}},[act]); const players=s?.players||Array.from({length:lobby&&!s?Math.max(2,lobby.members.length):settings.players},(_,p)=>({name:lobby&&!s?(lobby.members[p]?.name||'Waiting…'):NAMES[p],slots:[true,true,true,true],penalty:0}));
 const myReady=!!lobby?.members?.find((m:any)=>m.id===lobby.me)?.ready;
 const isHost=!!lobby&&lobby.host===lobby.me;
 const canStart=isHost&&lobby.members.length>=2&&lobby.members.every((m:any)=>m.ready);
 const can=s&&!s.players[0].eliminated&&s.active===0&&!busy&&!menu&&!panel;const ready=can&&s.phase==='ready';
 // The gap after your turn ends, before the next player has drawn: you may
 // still call the final round, even though it is no longer your turn.
 let justFinished=-1;if(s){justFinished=s.active;do{justFinished=(justFinished-1+s.players.length)%s.players.length;}while(s.players[justFinished].eliminated);}
 const canBuzzAfterTurn=!!s&&!s.players[0].eliminated&&s.active!==0&&!busy&&!menu&&!panel&&s.phase==='ready'&&s.caller===null&&s.turn>0&&!s.held&&justFinished===0;
 const buzzReady=(ready&&s.caller===null)||canBuzzAfterTurn;
 // Holding your own draw commits the turn — no throwing until the card lands.
 const holding=!!s&&s.active===0&&!!s.held;
 const canMatch=!!s&&!s.players[0].eliminated&&!menu&&!panel&&!holding&&!['memory','finished'].includes(s.phase)&&!!s.discard.length;
 function slotClick(p:number,i:number){if(s?.players[p].eliminated)return;if(p===0&&canMatch&&(!can||s.phase==='ready'||s.phase==='lastCall')){requestMatch(i);return;}if(!can)return;
 if(s.phase==='swap'){if(i<4&&!!s.players[p].slots[i])chooseSwap(p===0?(swapSlot===i?null:i):swapSlot,p===0?target:p);return;}if(p!==0)return;act({type:s.phase==='decision'?'replace':s.phase==='peek'?'peek':'match',i});}
 function renderSlot(player:any,p:number,card:any,i:number){
 const swapPick=can&&s.phase==='swap'&&i<4&&!!card&&(p===0||swapSlot===i&&!!s.players[0].slots[i]);
 const eligible=!player.eliminated&&!!card&&(p===0&&canMatch||can&&(p===0&&['decision','peek'].includes(s.phase))||swapPick);
 // The inspected pair stays face up through re-renders until the choice is made.
 const inspected=s?.phase==='swapConfirm'&&!!s.pending&&s.active===0&&i===s.pending.i&&(p===0||p===s.pending.target);
 return <button key={i} data-position={['TL','TR','BL','BR'][i]||`P${i-3}`} data-loc={`p${p}-${i}`} style={i>=4?{'--extra-column':Math.floor((i-4)/2),'--extra-row':(i-4)%2} as React.CSSProperties:undefined} className={'slot '+(i>=4?'penalty-slot ':'')+(eligible?'eligible ':'')+(p===0&&swapSlot===i&&s?.phase==='swap'?'chosen ':'')+(!card?'empty ':'')+(memory&&p===0&&i>1&&i<4?'memorizing':'')} disabled={player.eliminated||(!eligible&&!(can&&!player.eliminated&&s.phase==='swap'&&p!==0&&i<4&&!!card))} onClick={()=>slotClick(p,i)} aria-label={`${player.name} ${positionName(i)}${!card?' empty':(s?.phase==='finished'||inspected)&&card.rank?' '+label(card):' face down'}`}><Card rev={revision} empty={!card} card={(s?.phase==='finished'||inspected)&&card?.rank?card:null}/></button>;
 }
 // Opponents sit across the table, so their four positions render mirrored:
 // their own bottom two end up on the far side, facing them rather than you.
 const seatOrder=(count:number,p:number)=>{const order=Array.from({length:count},(_,n)=>n);return p===0?order:[...order.slice(0,4).reverse(),...order.slice(4)];};
 const positions=players.length===2?['player-0','player-2']:players.length===3?['player-0','player-1','player-3']:['player-0','player-1','player-2','player-3'];
 return <main className="game-shell"><section ref={table as any} className={'table '+(s?.caller!==null&&s?'final-round':'')} data-phase={s?.phase||'menu'} aria-label="Kamayuu game table"><header className="table-header"><div className="brand"><Lotus/><span>KAMAYUU</span></div><div className="header-actions"><button className="icon-btn" aria-label={settings.sound?'Mute sound':'Enable sound'} onClick={()=>{audio.current?.unlock();setSettings(v=>({...v,sound:!v.sound}));}}>{settings.sound?<Volume2 size={17}/>:<VolumeX size={17}/>}</button><button className="icon-btn" aria-label="Rules" onClick={()=>setPanel('rules')}><BookOpen size={17}/></button></div></header><div className="round-label">{s?`ROUND ${s.round}`:'THE LANTERN TABLE'}</div>
 {players.map((player:any,p:number)=><section key={p} className={'player '+positions[p]+(player.eliminated?' eliminated':'')+(s?.active===p&&!menu&&!player.eliminated?' active':'')+(can&&!player.eliminated&&s.phase==='swap'&&p!==0?' targetable':'')+(target===p?' targeted':'')} aria-label={player.name+' board'}><button className="player-label" disabled={!(can&&!player.eliminated&&s.phase==='swap'&&p!==0)} onClick={()=>chooseSwap(swapSlot,p)}><span className={'avatar avatar-'+p}>{p===0?'✧':player.name[0]}</span><span className="player-name">{player.name}</span><i>{player.slots.filter(Boolean).length}</i>{player.eliminated&&<b className="out-badge">OUT</b>}{s?.remaining.includes(p)&&<b className="final-dot" title="Final turn remaining"/>}</button><div className="card-grid">{seatOrder(Math.max(5,player.slots.length+(player.eliminated||player.slots.slice(4).some((c:any)=>!c)?0:1)),p).map((i:number)=>renderSlot(player,p,player.slots[i]||null,i))}{emote?.player===p&&<div key={emote.token} className="emote-overlay" aria-hidden="true"><div className="emote-sprite"/></div>}</div>{player.penalty>0&&<span className="penalty">+{player.penalty} penalty</span>}{s?.phase==='finished'&&<span className="total-label">{player.eliminated?'Eliminated':`${s.totals[p]} points`}</span>}<div data-loc={`held${p}`} className="decision-slot"><Card rev={revision} empty={!(s?.active===p&&s?.held)} card={s?.active===p&&s?.held?.rank&&(p===0||s.source==='discard'||s.phase==='peek'||s.phase==='swap')?s.held:null}/></div><div data-loc={`reveal${p}`} className="reveal-slot"><Card rev={revision} empty/></div></section>)}
 <div className="piles"><div><button data-loc="deck" className={'pile deck '+(ready?'available':'')} disabled={!ready} onClick={()=>act({type:'draw'})} aria-label="Draw from deck"><Card rev={revision}/></button><span>DECK <i>{deckSize(s)}</i></span></div><div><button data-loc="discard" className={'pile discard '+(ready&&takeable(s)?'available':'')} disabled={!(ready&&takeable(s))} onClick={()=>act({type:'take'})} aria-label={'Take discard '+(s?.discard.length?label(s.discard.at(-1)):s?'empty':'King of hearts')}><Card rev={revision} empty={s&&!s.discard.length} card={s?s.discard.at(-1):{rank:'K',suit:'♥'}}/></button><span>DISCARD</span></div></div>
 <div className="status" role="status" aria-live="polite"><span>{caption}</span><p>{message}</p>{memory&&countdown!==null&&<div className="memory-timer"><i style={{width:`${countdown/7*100}%`}}/><b>{countdown}</b></div>}</div>
 {can&&s.phase==='decision'&&s.source==='deck'&&<button className="text-action hand-action" onClick={()=>act({type:'discard'})}>Discard draw</button>}{can&&['swap','peek'].includes(s.phase)&&<button className="text-action hand-action" onClick={()=>act({type:'skip'})}>Pass power</button>}{can&&s.phase==='swapConfirm'&&<div className="swap-confirm"><button className="primary" onClick={()=>act({type:'swap'})}>Trade cards</button><button className="text-action" onClick={()=>act({type:'skip'})}>Keep mine</button></div>}{announce&&<div className="announce" role="status" aria-live="assertive">{announce}</div>}<div className="buzzer-area"><button className={'buzzer '+(buzzReady?'tempting':'')} disabled={!buzzReady} onClick={()=>act({type:'buzz'})} aria-label="Buzz — start the final round"><span>♛</span></button><b>{s?.caller!==null&&s?'FINAL ROUND':'BUZZER'}</b></div><button className="emotes-button" disabled={!s||menu||!!panel} onClick={sendEmote} aria-label="Send the haha emote"><span className="emotes-avatar"><img src="/emotes-icon.png" alt="" draggable={false}/></span><span>EMOTES</span></button><button className="settings-button" onClick={()=>setPanel('settings')} aria-label="Settings"><Settings size={21}/><span>Settings</span></button><footer className="table-footer"><span>{queued?'MATCH QUEUED · WAITING FOR THE CARD TO LAND':busy?'FOLLOW THE CARDS':'REMEMBER. OBSERVE. OUTTHINK.'}</span></footer>
 <LoadingScreen visible={gate==='loading'||!assetsDone||!minTimeElapsed} progress={assetProgress} motionShort={settings.motion}/>
 {gate==='signin'&&(
   <OnboardingScreen
    onContinueWithGoogle={handleGoogleClick}
    onContinueAsGuest={continueAsGuest}
    authBusy={authBusy}
    authError={authError}
    googleConfigured={googleConfigured()}
    onGoogleToken={handleGoogleSuccess}
    onGoogleError={(msg)=>setAuthError(msg)}
    backgroundImageUrl="/onboarding-bg.webp"
   />
  )}
 {gate==='onboarding'&&(
    <PlayerIdentityScreen
      initialName={draftName || (typeof window !== 'undefined' ? localStorage.getItem('lotus-name') || 'Guru' : 'Guru')}
      initialCountry={typeof window !== 'undefined' ? localStorage.getItem('lotus-country') || 'India' : 'India'}
      initialBadge={typeof window !== 'undefined' ? localStorage.getItem('lotus-badge') || 'compass' : 'compass'}
      initialPhoto={typeof window !== 'undefined' ? localStorage.getItem('lotus-avatar-photo') || '' : ''}
      onBack={()=>setGate(identityFrom)}
      onContinue={finishOnboarding}
      authBusy={authBusy}
      authError={authError}
      backgroundImageUrl="/onboarding-identity-bg.webp"
    />
  )}
 {online==='room'&&!s&&lobby&&<div className="welcome"><div className="welcome-card lobby-card"><Lotus/><p className="eyebrow">TABLE CODE</p><h1 className="room-code">{lobby.code}</h1>
 <ul className="lobby-members">{lobby.members.map((m:any)=><li key={m.id}><i className={'seat-dot'+(presence.includes(m.id)?' on':'')}/><span>{m.name}</span>{m.id===lobby.host&&<b>HOST</b>}{m.ready&&<em>READY</em>}</li>)}</ul>
 <button className="primary" onClick={()=>sendCommand('ready',{ready:!myReady})}>{myReady?'Not ready'
 :'I’m ready'}</button>
 {isHost?<button className="primary" disabled={!canStart} onClick={()=>sendCommand('start')}>Start the match</button>:<small>The host starts once everyone is ready.</small>}
 {joinError&&<p className="form-error">{joinError}</p>}
 <button className="text-action" onClick={leaveOnline}>Leave table</button>
 <small>{connection||'Connected'}</small></div></div>}
 {online==='connecting'&&<div className="welcome"><div className="welcome-card"><Lotus/><p className="eyebrow">{connection||'CONNECTING…'}</p></div></div>}
 {online==='room'&&s&&<div className="online-hud"><i className={'seat-dot'+(connection==='Connected'?' on':'')}/><span>{lobby?.code}</span>{clock!==null&&<b>{clock}s</b>}<button className="text-action" onClick={()=>leaveOnline()}>Leave</button></div>}
 {gate==='ready'&&menu&&(
    <HomeScreen
      playerName={profile?.display_name || playerName || 'Guru'}
      playerPhoto={typeof window !== 'undefined' ? localStorage.getItem('lotus-avatar-photo') || '' : ''}
      playerRank="Gold II"
      playerRating={1248}
      aiDifficulty={settings.difficulty}
      onDifficultyChange={(diff) => setSettings((x) => ({ ...x, difficulty: diff }))}
      playerCount={settings.players}
      onPlayerCountChange={(count) => setSettings((x) => ({ ...x, players: count }))}
      onQuickMatch={() => setPanel('soon')}
      onComingSoon={() => setPanel('soon')}
      onPrivateTable={() => {
        setJoinError('');
        setPanel('online');
      }}
      onPractice={(diff, count) => {
        setSettings((x) => ({ ...x, difficulty: diff, players: count }));
        audio.current?.unlock();
        start({ difficulty: diff, players: count });
      }}
      onHowToPlay={() => setPanel('rules')}
      onOpenSettings={() => setPanel('settings')}
      onOpenFriends={() => {
        setJoinError('');
        setPanel('online');
      }}
      onOpenLeaderboard={() => setPanel('leaderboard')}
      backgroundImageUrl="/onboarding-identity-bg.webp"
    />
  )}
 {result&&s&&<div className="results"><p className="eyebrow">{s.winners.length>1?'SHARED VICTORY':'THE WINNER'}</p><h2>{s.winners.map((p:number)=>seatName(p,s)).join(' & ')}</h2><span className="winning-score">{s.totals[s.winners[0]]} <small>points</small></span><div className="result-scores">{s.players.map((p:any,i:number)=><span key={i}><b>{p.name}</b><strong>{p.eliminated?'OUT':s.totals[i]}</strong><small>{p.slots.filter(Boolean).length} cards{p.penalty?` · +${p.penalty}`:''}</small></span>)}</div><div className="result-actions">{online==='room'?<>{isHost?<button className="primary" onClick={()=>sendCommand('rematch')}>Rematch</button>:<small>Waiting for the host to start a rematch.</small>}<button className="text-action" onClick={()=>leaveOnline()}>Leave the table</button></>:<><button className="primary" onClick={()=>start()}>Play again</button><button className="text-action" onClick={()=>{cancel();setMenu(true);}}>Main menu</button></>}<button className="text-action" onClick={()=>setResult(false)}>View table</button></div></div>}
 {s?.phase==='finished'&&!result&&!menu&&<button className="show-results primary" onClick={()=>setResult(true)}>View results</button>}
 </section><Dialog open={!!panel} onOpenChange={(open)=>{if(!open)setPanel(null);}}><DialogContent className="game-dialog"><DialogTitle>{panel==='soon'?'Quick Match is coming soon':panel==='rules'?'The rules of the table':panel==='online'?'Play with friends':panel==='leaderboard'?'Leaderboard & Honor':'Your table'}</DialogTitle><DialogDescription>{panel==='soon'?'Matchmaking opens once the tables fill.':panel==='rules'?'Lowest total wins. Memory makes the difference.':panel==='online'?'Create a table and share the code, or join one.':panel==='leaderboard'?'Season 1 · Lantern Ascendance Rankings':'These preferences stay on this device.'}</DialogDescription>{panel==='soon'?<div className="rules-content"><div className="rule"><b>✦</b><p><strong>Not live yet.</strong> Quick Match pairs you with strangers, so it needs a pool of players to draw from. Once enough people are playing Kamayuu, casual and ranked matchmaking will open right here.</p></div><p className="rules-foot">Until then: invite friends to a Private Table with a six-character code, or sharpen up against the AI in Practice.</p><button className="primary" onClick={()=>{setJoinError('');setPanel('online');}}>Open a private table</button></div>:panel==='online'?<div className="online-content">
 <label className="name-field"><span>Your name</span><input value={playerName} onChange={e=>{setPlayerName(e.target.value);try{localStorage.setItem('lotus-name',e.target.value);}catch{}}} maxLength={16} placeholder="Guest" autoComplete="nickname"/></label>
 <button className="primary" onClick={()=>connect('create',{name:playerName})}>Create a table</button>
 <div className="join-row">
  <input value={joinCode} onChange={e=>setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g,'').slice(0,6))} placeholder="CODE" aria-label="Table code" autoCapitalize="characters" autoCorrect="off" spellCheck={false}/>
  <button className="primary" disabled={joinCode.length<6} onClick={()=>connect('join',{code:joinCode,name:playerName})}>Join</button>
 </div>
 {joinError&&<p className="form-error">{joinError}</p>}
 <p>Two to four players. Everyone joins with the same six-character code. Your cards stay hidden on the server — nobody else can read them.</p>
</div>:panel==='leaderboard'?<div className="rules-content leaderboard-content">
  <div className="rule"><b>✦</b><p><strong>Your Standing:</strong> Rank #42 · Gold II · 1,248 Rating · {stats.won} Wins / {stats.played} Played</p></div>
  <div className="rule"><b>01</b><p><strong>Crown of Dawn</strong> — 2,450 Rating (Grandmaster)</p></div>
  <div className="rule"><b>02</b><p><strong>Kai (Shadow Dancer)</strong> — 2,180 Rating (Master I)</p></div>
  <div className="rule"><b>03</b><p><strong>Rin (Silent River)</strong> — 1,995 Rating (Diamond II)</p></div>
  <div className="rule"><b>04</b><p><strong>Mira (Lotus Heart)</strong> — 1,820 Rating (Gold I)</p></div>
  <div className="rule"><b>05</b><p><strong>{profile?.display_name||playerName||'Guru'} (You)</strong> — 1,248 Rating (Gold II)</p></div>
 </div>:panel==='rules'?<div className="rules-content"><div className="rule"><b>01</b><p><strong>Remember two.</strong> At the deal, only your bottom two cards are revealed. All four positions stay fixed, even when empty.</p></div><div className="rule"><b>02</b><p><strong>Take your turn.</strong> Draw from the deck, then replace one occupied card or discard your draw. Or take the public discard and replace a card, unless you were the one who discarded it. You cannot take back your own top discard. Removed cards reveal publicly.</p></div><div className="rule"><b>03</b><p><strong>Throw a match.</strong> During anyone’s turn, tap your card if you think its rank matches the top discard — but not once you are holding a draw of your own; finish that turn first. A hit does not spend a turn. A miss reveals your card to everyone, returns it, and adds the top discard to a separate penalty slot; if it was your own turn, the miss ends it. Penalty cards can be replaced, peeked at, or matched away.</p></div><div className="power-rules"><p><b className="red-text">J ♥</b><span>A <strong>red</strong> Jack drawn from the deck: privately peek at one of your cards. Black Jacks have no power.</span></p><p><b className="red-text">Q ♥</b><span>A <strong>red</strong> Queen drawn from the deck: pick one of your four positions and an opponent. You alone see both faces, then choose to trade or keep yours — the trade is never forced. Either way the Queen is discarded. Black Queens have no power.</span></p><p><b className="red-text">K ♦</b><span>Red Kings are worth zero. A = 1; numbers = face value; J = 11; Q = 12; black K = 13.</span></p></div><p>Red Jack and red Queen powers may be passed; the drawn power card is discarded. Taking either from the discard has no power.</p><div className="rule"><b>04</b><p><strong>Know when to buzz.</strong> Buzz at the start of your turn — it costs you nothing: you still play that turn, and then every other remaining player gets exactly one final turn. You may also buzz right after your turn ends, before the next player has drawn — then you do not get another turn, and the final round runs from the next player onward. You can still be targeted by a Queen. Then every card reveals; the lowest total among remaining players wins. Ties share the win.</p></div><p className="rules-foot">Empty hands automatically call the final round. The original four positions never move. Queen swaps use only those four positions, matched one to one: your top left pairs with their top left. Opponent boards are drawn mirrored, because their own bottom two face them. Penalty cards appear only when received. Your original four positions stay fixed as penalties extend horizontally. Reaching six cards on your board eliminates you immediately. Empty slots and your pending draw do not count. Eliminated players cannot act or be swapped with. The last remaining player wins automatically. When needed, shuffle the discards back into the deck, keeping its top card.</p></div>:<div className="settings-content"><label><span>Table sounds</span><Switch checked={settings.sound} onCheckedChange={v=>{audio.current?.unlock();setSettings(x=>({...x,sound:v}));}}/></label><label><span>Haptics <small>On supported devices</small></span><Switch checked={settings.haptics} onCheckedChange={v=>setSettings(x=>({...x,haptics:v}))}/></label><label><span>Shorter movements</span><Switch checked={settings.motion} onCheckedChange={v=>setSettings(x=>({...x,motion:v}))}/></label><p>{stats.won} wins in {stats.played} completed matches</p>{online==='room'?<>{isHost&&s?.phase==='finished'&&<button className="primary" onClick={()=>{setPanel(null);sendCommand('rematch');}}><RotateCcw size={16}/> Rematch</button>}{!isHost&&s?.phase==='finished'&&<small>The host starts the rematch.</small>}<button className="text-action" onClick={()=>{setPanel(null);leaveOnline();}}>Leave the table</button></>:<><button className="primary" onClick={()=>start()}><RotateCcw size={16}/> New match</button><button className="text-action" onClick={()=>{cancel();setPanel(null);setMenu(true);}}>Return to main menu</button></>}
 <div className="account-block">
  <p><b>{profile?.display_name||playerName||'Guru'}</b>{guest?' · guest':''}</p>
  {profile&&<small>{profile.matches_won} online wins in {profile.matches_played} matches</small>}
  <button className="text-action" onClick={()=>{setDraftName(profile?.display_name||playerName||'');setDraftAvatar(profile?.avatar||'lotus');setPanel(null);setIdentityFrom('ready');setGate('onboarding');}}>Change name or mark</button>
  <button className="text-action" onClick={()=>{setPanel(null);setGate('signin');}}>View onboarding page</button>
  <button className="text-action" onClick={leaveAccount}>{guest?'Sign in with Google':'Sign out'}</button>
 </div></div>}</DialogContent></Dialog></main>
}
