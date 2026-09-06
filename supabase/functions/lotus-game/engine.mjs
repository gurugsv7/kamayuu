// Pure rules engine. Presentation receives observation events; AI receives a redacted view.
export const POSITIONS = ['top left','top right','bottom left','bottom right'];
export const positionName = i => POSITIONS[i] || `penalty ${i-3}`;
export const NAMES = ['You','Kai','Rin','Mira'];
export const value = c => !c ? 0 : c.rank === 'K' && (c.suit==='♥'||c.suit==='♦') ? 0 : c.rank==='A'?1: c.rank==='J'?11:c.rank==='Q'?12:c.rank==='K'?13:Number(c.rank);
export const isRed = c => c?.suit==='♥'||c?.suit==='♦';
export const isPower = c => !isRed(c)?null:c.rank==='J'?'peek':c.rank==='Q'?'swap':null;
export const label = c => c ? c.rank+c.suit : 'empty';
function random(s){s.seed|=0;s.seed=s.seed+0x6D2B79F5|0;let t=Math.imul(s.seed^s.seed>>>15,1|s.seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;}
function shuffle(s,arr){for(let i=arr.length-1;i>0;i--){let j=Math.floor(random(s)*(i+1));[arr[i],arr[j]]=[arr[j],arr[i]];}return arr;}
export function createGame({players=4,difficulty='medium',seed=Date.now()}={}){
 if(![2,3,4].includes(players)||!['easy','medium','hard'].includes(difficulty))throw Error('Invalid game settings');
 const s={seed,players:Array.from({length:players},(_,p)=>({name:NAMES[p],slots:[null,null,null,null],penalty:0,eliminated:false})),knowledge:Array.from({length:players},()=>Array.from({length:players},()=>[null,null,null,null])),deck:[],discard:[],discardOwners:{},held:null,source:null,pending:null,phase:'memory',active:0,turn:0,round:1,caller:null,remaining:[],difficulty,winners:[],totals:[]};
 for(const suit of ['♠','♥','♣','♦'])for(const rank of ['A','2','3','4','5','6','7','8','9','10','J','Q','K'])s.deck.push({id:rank+suit,rank,suit});shuffle(s,s.deck);
 const events=[];for(let p=0;p<players;p++)for(let i=0;i<4;i++){const c=s.deck.pop();s.players[p].slots[i]=c;events.push({type:'deal',p,i});}
 for(let p=0;p<players;p++)for(const i of [2,3])s.knowledge[p][p][i]=s.players[p].slots[i];
 const first=s.deck.pop();s.discard.push(first);events.push({type:'firstDiscard',card:first});assertState(s);return {state:s,events};
}
function know(s,p,i,c,observer=null){for(let o=0;o<s.players.length;o++)s.knowledge[o][p][i]=observer===null||observer===o?c:null;}
function forget(s){const rate={easy:.12,medium:.025,hard:0}[s.difficulty];for(let o=1;o<s.players.length;o++)for(const row of s.knowledge[o])for(let i=0;i<row.length;i++)if(random(s)<rate)row[i]=null;}
function livePlayers(s){return s.players.flatMap((p,i)=>p.eliminated?[]:[i]);}
function final(s,events){s.phase='finished';s.pending=null;s.remaining=[];s.totals=s.players.map(p=>p.slots.reduce((n,c)=>n+value(c),p.penalty));const live=livePlayers(s),low=Math.min(...live.map(p=>s.totals[p]));s.winners=live.filter(p=>s.totals[p]===low);events.push({type:'final',totals:s.totals});}
// A player who calls the final round still plays the turn they are on; only the
// automatic calls (an empty board, an exhausted deck) happen with the turn spent.
// A caller other than the active player is someone who just finished their own
// turn, buzzing in the gap before the next player has drawn — that caller is
// excluded from the rotation outright (they already had their turn) and the
// active player, already next in line, is untouched.
function buzz(s,events,keepTurn=false,caller=s.active){
 s.caller=caller;
 const others=Array.from({length:s.players.length-1},(_,i)=>(caller+i+1)%s.players.length).filter(p=>!s.players[p].eliminated);
 s.remaining=keepTurn?[caller,...others]:others;
 events.push({type:'buzz',p:caller,keepTurn});
 if(!s.remaining.length){final(s,events);return;}
 s.active=s.remaining[0];s.phase='ready';
}
// The player who just finished the turn before the current active player — the
// only other player allowed to buzz in the "ready" gap, and only there.
function previousPlayer(s){let f=s.active;do{f=(f-1+s.players.length)%s.players.length;}while(s.players[f].eliminated);return f;}
function endTurn(s,events){s.held=null;s.source=null;s.pending=null;s.turn++;s.round=Math.floor(s.turn/s.players.length)+1;forget(s);if(s.caller!==null){if(s.remaining[0]!==s.active)throw Error('Final rotation corrupted');s.remaining.shift();if(!s.remaining.length){s.phase='lastCall';events.push({type:'lastCall'});return;}s.active=s.remaining[0];}else if(s.players[s.active].slots.every(c=>c===null)){buzz(s,events);return;}else{do{s.active=(s.active+1)%s.players.length;}while(s.players[s.active].eliminated);}s.phase='ready';}
function releaseHeld(s,events){s.pending=null;if(!s.held)return;const card=s.held;s.discard.push(card);s.discardOwners[card.id]=s.active;events.push({type:'discard',p:s.active,card});s.held=null;s.source=null;}
function eliminate(s,p,events){
 s.players[p].eliminated=true;events.push({type:'eliminate',p});s.remaining=s.remaining.filter(q=>q!==p);
 const live=livePlayers(s);
 if(live.length===1){releaseHeld(s,events);s.active=live[0];final(s,events);return;}
 if(p===s.active){releaseHeld(s,events);s.turn++;s.round=Math.floor(s.turn/s.players.length)+1;forget(s);
  if(s.caller!==null){if(!s.remaining.length){s.active=live[0];s.phase='lastCall';events.push({type:'lastCall'});return;}s.active=s.remaining[0];}
  else{do{s.active=(s.active+1)%s.players.length;}while(s.players[s.active].eliminated);}
  s.phase='ready';
 }
}
function discardHeld(s,events){const c=s.held;s.discard.push(c);s.discardOwners[c.id]=s.active;events.push({type:'discard',p:s.active,card:c});endTurn(s,events);}
function draw(s,events){if(!s.deck.length){const top=s.discard.pop();s.deck=shuffle(s,s.discard.splice(0));s.discard=top?[top]:[];events.push({type:'reshuffle',count:s.deck.length});}if(!s.deck.length){if(s.caller===null)buzz(s,events);else endTurn(s,events);return;}s.held=s.deck.pop();s.source='deck';s.phase=isPower(s.held)||'decision';events.push({type:'draw',p:s.active,card:s.held,public:!!isPower(s.held)});}
export function transition(before,action){
 const s=structuredClone(before),events=[];s.discardOwners??={};const p=['match','forfeit'].includes(action.type)?(action.player??s.active):s.active;const i=action.i;
 if(!Number.isInteger(p)||p<0||p>=s.players.length)throw Error('Invalid player');
 if(s.players[p].eliminated)throw Error('Player is out');
 const occupied=()=>Number.isInteger(i)&&i>=0&&i<s.players[p].slots.length&&!!s.players[p].slots[i];
 if(action.type==='forfeit'&&!['memory','finished'].includes(s.phase)){eliminate(s,p,events);events.find(e=>e.type==='eliminate').reason='forfeit';}
 else if(action.type==='match'&&['ready','decision','peek','swap','swapConfirm','lastCall'].includes(s.phase)){
  if(!occupied()||!s.discard.length)throw Error('No matching target');
  // Once you hold a draw your turn is committed: finish it before throwing.
  if(p===s.active&&s.held)throw Error('Finish your draw before throwing a match');
  if(action.expectedDiscard&&s.discard.at(-1).id!==action.expectedDiscard)throw Error('The discard moved');
  if(action.expectedCard&&s.players[p].slots[i].id!==action.expectedCard)throw Error('The selected position moved');
  const c=s.players[p].slots[i],ok=c.rank===s.discard.at(-1).rank;
  const event={type:'match',p,i,card:c,ok};events.push(event);
  if(ok){s.players[p].slots[i]=null;know(s,p,i,null);s.discard.push(c);s.discardOwners[c.id]=p;}
  else{
   know(s,p,i,c);const penalty=s.discard.pop();let penaltyIndex=s.players[p].slots.findIndex((card,j)=>j>=4&&!card);
   if(penaltyIndex<0)penaltyIndex=s.players[p].slots.length;
   s.players[p].slots[penaltyIndex]=penalty;know(s,p,penaltyIndex,penalty);
   Object.assign(event,{penalty,penaltyIndex,nextDiscard:s.discard.at(-1)||null});
   if(s.players[p].slots.filter(Boolean).length>=6)eliminate(s,p,events);
  }
  // A reaction preserves the interrupted turn unless its active player is eliminated.
  if(s.players[p].slots.every(c=>c===null)&&s.caller===null){
   if(p===s.active)buzz(s,events);
   else{s.caller=p;s.remaining=Array.from({length:s.players.length},(_,i)=>(s.active+i)%s.players.length).filter(q=>q!==p&&!s.players[q].eliminated);events.push({type:'buzz',p});}
  }
  // A miss on your own turn costs that turn: the penalty lands, then the turn is spent.
  if(!ok&&p===s.active&&!s.players[p].eliminated&&s.phase==='ready'){
   event.turnLost=true;endTurn(s,events);
  }
 }
 else if(action.type==='finish'&&s.phase==='lastCall'){final(s,events);}
 else if(action.type==='remember'&&s.phase==='memory'){s.phase='ready';events.push({type:'memoryEnd'});}
 else if(s.phase==='ready'){
  if(action.type==='draw')draw(s,events);
  else if(action.type==='take'&&canTakeDiscard(s,p)){s.held=s.discard.pop();s.source='discard';s.phase='decision';events.push({type:'take',p,card:s.held});}
  else if(action.type==='buzz'&&s.caller===null&&action.player!==undefined&&action.player!==s.active){
   // The gap after a turn ends, before the next player has drawn: the player
   // who just went may still call the final round, but does not get it kept —
   // they already had their turn — and the newly active player is untouched.
   if(s.turn===0||s.held)throw Error('No finished turn to buzz after');
   const finisher=previousPlayer(s);
   if(action.player!==finisher||s.players[finisher].eliminated)throw Error('Only the player who just finished may buzz here');
   buzz(s,events,false,finisher);
  }
  else if(action.type==='buzz'&&s.caller===null)buzz(s,events,true);

  else throw Error('Choose a valid turn action');
 }else if(s.phase==='decision'){
  if(action.type==='replace'&&occupied()){const old=s.players[p].slots[i],c=s.held;s.players[p].slots[i]=c;know(s,p,i,c,s.source==='discard'?null:p);s.discard.push(old);s.discardOwners[old.id]=p;events.push({type:'replace',p,i,card:c,old,public:s.source==='discard'});endTurn(s,events);}
  else if(action.type==='discard'&&s.source==='deck')discardHeld(s,events);
  else throw Error('Choose an occupied position');
 }else if(s.phase==='peek'){
  if(action.type==='peek'&&occupied()){const c=s.players[p].slots[i];s.knowledge[p][p][i]=c;events.push({type:'peek',p,i,card:c});discardHeld(s,events);}
  else if(action.type==='skip')discardHeld(s,events);
  else throw Error('Choose one of your cards to peek');
 }else if(s.phase==='swap'){
  const target=action.target;
  // The Queen only looks. Both faces go to its user, who then chooses to trade or keep.
  if(action.type==='inspect'&&i<4&&occupied()&&Number.isInteger(target)&&target>=0&&target<s.players.length&&target!==p&&!s.players[target].eliminated&&s.players[target].slots[i]){
   const mine=s.players[p].slots[i],theirs=s.players[target].slots[i];
   s.knowledge[p][p][i]=mine;s.knowledge[p][target][i]=theirs;
   s.pending={target,i};s.phase='swapConfirm';events.push({type:'inspect',p,target,i,mine,theirs});
  }else if(action.type==='skip')discardHeld(s,events);
  else throw Error('Swap requires two occupied cards in the same position');
 }else if(s.phase==='swapConfirm'){
  const {target,i:j}=s.pending;
  // A reaction match may have emptied either card while the choice was open.
  const viable=!s.players[target].eliminated&&!!s.players[p].slots[j]&&!!s.players[target].slots[j];
  if(action.type==='swap'&&viable){
   [s.players[p].slots[j],s.players[target].slots[j]]=[s.players[target].slots[j],s.players[p].slots[j]];
   for(const memory of s.knowledge)[memory[p][j],memory[target][j]]=[memory[target][j],memory[p][j]];
   s.knowledge[p][p][j]=s.players[p].slots[j];s.knowledge[p][target][j]=s.players[target].slots[j];
   events.push({type:'swap',p,target,i:j,incoming:s.players[p].slots[j],outgoing:s.players[target].slots[j]});discardHeld(s,events);
  }else if(action.type==='skip'||!viable){events.push({type:'swapEnd',p,target,i:j});discardHeld(s,events);}
  else throw Error('Choose to trade or keep your card');
 }else throw Error('Action unavailable');
 assertState(s);return {state:s,events};
}
export function assertState(s){
 const cards=[...s.deck,...s.discard,...s.players.flatMap(p=>p.slots.filter(Boolean)),...(s.held?[s.held]:[])];
 if(cards.length!==52||new Set(cards.map(c=>c.id)).size!==52)throw Error('Card conservation failed');
 if(s.players.some(p=>p.slots.length<4||p.penalty<0))throw Error('Invalid board');
 if(s.active<0||s.active>=s.players.length)throw Error('Invalid player');
 if(s.players[s.active].eliminated||s.remaining.some(p=>s.players[p].eliminated))throw Error('Eliminated player in turn rotation');
 if(s.players.some(p=>!p.eliminated&&p.slots.filter(Boolean).length>=6))throw Error('Six cards must eliminate');
 if(s.pending&&s.phase!=='swapConfirm')throw Error('Stale pending swap');
 if(new Set(s.remaining).size!==s.remaining.length||s.remaining.slice(1).includes(s.caller))throw Error('Invalid final turns');
 for(let o=0;o<s.players.length;o++)for(let p=0;p<s.players.length;p++)for(let i=0;i<s.players[p].slots.length;i++)if(s.knowledge[o][p][i]&&s.knowledge[o][p][i].id!==s.players[p].slots[i]?.id)throw Error('Stale knowledge');return true;
}
export function canTakeDiscard(s,p=s?.active){const top=s?.discard.at(-1);return !!top&&!s.players[p]?.eliminated&&!!s.players[p]?.slots.some(Boolean)&&s.discardOwners?.[top.id]!==p;}
// This is the sole input to the AI policy: no deck order, no true hidden cards.
export function aiView(s,p=s.active){return {active:p,phase:s.phase,turn:s.turn,difficulty:s.difficulty,caller:s.caller,pending:s.pending||null,held:s.active===p?s.held:null,source:s.source,discard:s.discard.at(-1)||null,canTakeDiscard:canTakeDiscard(s,p),players:s.players.map((player,q)=>({penalty:player.penalty,eliminated:!!player.eliminated,slots:player.slots.map((c,i)=>c?{occupied:true,known:s.knowledge[p][q][i]}:{occupied:false,known:null})}))};}
export function chooseReaction(v){if(!v.discard||v.held||v.players[v.active].eliminated)return null;const i=v.players[v.active].slots.findIndex(c=>c.occupied&&c.known?.rank===v.discard?.rank);return i<0?null:{type:'match',player:v.active,i,expectedDiscard:v.discard.id};}
export function chooseAction(v,rng=Math.random){
 if(v.phase==='lastCall')return {type:'finish'};
 const p=v.active,own=v.players[p].slots;const score=x=>x.known?value(x.known):6.8;const slots=own.flatMap((c,i)=>c.occupied?[i]:[]);const worst=[...slots].sort((a,b)=>score(own[b])-score(own[a]))[0];
 if(v.phase==='ready'){
  const match=v.discard?slots.find(i=>own[i].known?.rank===v.discard.rank):undefined;if(match!==undefined)return {type:'match',i:match};
  const total=slots.reduce((n,i)=>n+score(own[i]),v.players[p].penalty);let threshold={easy:7,medium:10,hard:12}[v.difficulty];
  if(v.caller===null&&(slots.length===0||(v.turn>=v.players.length&&total<=threshold)||(v.turn>70&&total<20)||v.turn>160))return {type:'buzz'};
  if(v.canTakeDiscard&&v.discard&&worst!==undefined&&value(v.discard)<score(own[worst])-1.3)return {type:'take'};
  return {type:'draw'};
 }
 if(v.phase==='decision'){
  if(v.source==='discard'||value(v.held)<score(own[worst])-(v.difficulty==='easy'?rng()*3:.6))return {type:'replace',i:worst};
  return {type:'discard'};
 }
 if(v.phase==='peek'){const unknown=slots.find(i=>!own[i].known);return unknown!==undefined?{type:'peek',i:unknown}:slots.length?{type:'peek',i:worst}:{type:'skip'};}
 if(v.phase==='swap'){
  const targets=[];for(let q=0;q<v.players.length;q++)if(q!==p&&!v.players[q].eliminated)for(const i of slots)if(i<4&&v.players[q].slots[i].occupied)targets.push({target:q,i,gain:score(own[i])-score(v.players[q].slots[i])+(v.caller===q?.6:0)});
  targets.sort((a,b)=>b.gain-a.gain);
  // Looking is free, so always look at the most promising pair before deciding.
  return targets[0]?{type:'inspect',target:targets[0].target,i:targets[0].i}:{type:'skip'};
 }
 if(v.phase==='swapConfirm'){
  const {target,i}=v.pending;const theirs=v.players[target].slots[i];
  if(!own[i]?.occupied||!theirs?.occupied||v.players[target].eliminated)return {type:'skip'};
  return score(own[i])-score(theirs)+(v.caller===target?.6:0)>0?{type:'swap'}:{type:'skip'};
 }
 throw Error('AI cannot act in this phase');
}
