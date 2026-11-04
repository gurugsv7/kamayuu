import {auth} from './account';
import {familyPermissions} from './family-policy.mjs';
const URL=process.env.NEXT_PUBLIC_SUPABASE_URL||'', KEY=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||'';
export type AgeBand='under_13'|'13_17'|'18_plus';
export type FamilyAccount={user_id?:string;age_band?:AgeBand;alias?:string;consent?:boolean;online_allowed?:boolean;social_allowed?:boolean;rematches_allowed?:boolean;revoked?:boolean};
let current:FamilyAccount|null=null;
export const familyError=(error:unknown)=>error instanceof Error?error.message:'Could not update family settings.';
export const familyState=()=>current;
export const analyticsAllowed=()=>familyPermissions(current).analytics;
export function storedAge():AgeBand|null {try{const x=localStorage.getItem('kamayuu-age-band');return ['under_13','13_17','18_plus'].includes(x||'')?x as AgeBand:null;}catch{return null;}}
export function rememberAge(age:AgeBand){localStorage.setItem('kamayuu-age-band',age);}
export async function familyRequest<T=Record<string,unknown>>(command:string,extra:Record<string,unknown>={},signed=true):Promise<T>{
 const session=signed?(await auth().auth.getSession()).data.session:null;
 const r=await fetch(`${URL}/functions/v1/lotus-family`,{method:'POST',headers:{apikey:KEY,'Content-Type':'application/json',...(session?{Authorization:`Bearer ${session.access_token}`}:{})},body:JSON.stringify({command,...extra}),signal:AbortSignal.timeout(20000)});
 const data:unknown=await r.json();if(!r.ok){const error=data&&typeof data==='object'&&'error' in data?data.error:null;throw Error(typeof error==='string'?error:'Could not update family settings.');}return data as T;
}
export async function setupAge(age:AgeBand){current=await familyRequest<FamilyAccount>('register',{age});return current;}
export async function refreshFamily(){current=await familyRequest<FamilyAccount>('status');return current;}
export async function beginParent(){
 let secret=localStorage.getItem('kamayuu-family-secret');
 if(!secret){secret=Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');localStorage.setItem('kamayuu-family-secret',secret);}
 const deviceHash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret))),x=>x.toString(16).padStart(2,'0')).join('');
 return familyRequest<{session:string;verificationUrl:string}>('begin',{deviceHash},false);
}
export async function redeemParent(session:string){
 const secret=localStorage.getItem('kamayuu-family-secret');if(!secret)throw Error('Start parent setup on this device first.');
 const data=await familyRequest<{session:{access_token:string;refresh_token:string};account:FamilyAccount}>('redeem',{session,secret},false);
 const {error}=await auth().auth.setSession(data.session);if(error)throw error;
 current=data.account;return data.account;
}
