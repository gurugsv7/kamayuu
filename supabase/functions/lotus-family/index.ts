import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {consentProvider,verifiedConsent} from './family-consent.mjs';
const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Content-Type':'application/json','Cache-Control':'no-store'};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
const hash=async(text:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),n=>n.toString(16).padStart(2,'0')).join('');
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Use POST'},405);
 try{
  const raw=await req.text();if(raw.length>4096)return reply({error:'Request too large'},413);
  const input=JSON.parse(raw);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const server=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await server.rpc(name,args);if(error)throw Error(error.message);return data;};
  const provider=consentProvider(Deno.env.get('FAMILY_VPC_URL'),Deno.env.get('FAMILY_VPC_KEY'));
  if(input.command==='begin'){
   if(!/^[a-f0-9]{64}$/.test(input.deviceHash))throw Error('Invalid device');
   const result=await provider('begin',{deviceHash:input.deviceHash});
   const verification=new URL(result.verificationUrl);
   const allowed=(Deno.env.get('FAMILY_VPC_VERIFICATION_ORIGINS')||'').split(',').map(x=>x.trim());
   if(typeof result.session!=='string'||verification.protocol!=='https:'||!allowed.includes(verification.origin))throw Error('Parent verification origin is not configured.');
   return reply({session:result.session,verificationUrl:result.verificationUrl});
  }
  if(input.command==='redeem'){
   if(!/^[a-f0-9]{64}$/.test(input.secret)||typeof input.session!=='string'||input.session.length>200)throw Error('Invalid parent session');
   const deviceHash=await hash(input.secret);
   const grant=verifiedConsent(await provider('verify',{session:input.session,deviceHash}),deviceHash);
   const user=await rpc('family_claim',{p_grant:grant});
   const email=`child-${user}@accounts.kamayuu.invalid`;
   const existing=await server.auth.admin.getUserById(user);
   if(!existing.data?.user){
    const created=await server.auth.admin.createUser({id:user,email,email_confirm:true,password:crypto.randomUUID()+crypto.randomUUID()});
    if(created.error){const retry=await server.auth.admin.getUserById(user);if(!retry.data?.user)throw Error('Could not create the child account.');}
   }
   const account=await rpc('family_activate',{p_user:user,p_grant:grant});
   if(account.revoked)throw Error('Consent has been withdrawn.');
   const saved=await server.from('profiles').upsert({id:user,display_name:account.alias,avatar:'lotus'},{onConflict:'id'});
   if(saved.error)throw Error('Could not create the child profile.');
   const link=await server.auth.admin.generateLink({type:'magiclink',email});
   if(link.error)throw Error('Could not open the child session.');
   const login=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
   const session=await login.auth.verifyOtp({token_hash:link.data.properties.hashed_token,type:'magiclink'});
   if(session.error||!session.data.session)throw Error('Could not open the child session.');
   return reply({account,session:{access_token:session.data.session.access_token,refresh_token:session.data.session.refresh_token}});
  }
  if(['children','manage','delete_child'].includes(input.command)){
   // Parent credential is issued and verified by VPC provider, never by a
   // child checkbox, age declaration, OAuth user metadata, or locally stored PIN.
   const parent=await provider('parent',{credential:input.credential});
   if(parent.verified!==true||typeof parent.guardian!=='string'||!parent.guardian||!Number.isFinite(Date.parse(parent.expiresAt))||Date.parse(parent.expiresAt)<=Date.now())throw Error('Parent verification required.');
   if(input.command==='children')return reply(await rpc('family_children',{p_guardian:parent.guardian}));
   const state=await rpc('family_manage',{p_guardian:parent.guardian,p_user:input.child,p_settings:input.command==='delete_child'?{revoke:true}:input.settings||{}});
   if(input.command==='delete_child'){await rpc('family_purge',{p_user:input.child});const result=await server.auth.admin.deleteUser(input.child);if(result.error)throw Error('Deletion could not be completed. Access is revoked; please retry.');return reply({deleted:true});}
   return reply(state);
  }
  const token=req.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if(!token)return reply({error:'Sign in required'},401);
  const {data,error}=await server.auth.getUser(token);if(error||!data.user)return reply({error:'Session expired'},401);
  const user=data.user.id;
  if(input.command==='register')return reply(await rpc('family_register',{p_user:user,p_age:input.age}));
  if(input.command==='status')return reply(await rpc('family_state',{p_user:user}));
  if(input.command==='delete_account'){
   const state=await rpc('family_state',{p_user:user});
   if(state.age_band==='under_13')throw Error('Ask your parent to delete this account in Family settings.');
   await rpc('family_purge',{p_user:user});
   const result=await server.auth.admin.deleteUser(user);if(result.error)throw Error('Deletion could not be completed. Please contact support.');
   return reply({deleted:true});
  }
  return reply({error:'Unknown command'},400);
 }catch(error){return reply({error:error instanceof Error?error.message:'Unable to complete family setup'},400);}
});
