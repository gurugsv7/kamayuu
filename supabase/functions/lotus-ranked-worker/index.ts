import {createClient} from 'npm:@supabase/supabase-js@2.115.0';
import {rankedTick} from './ranked-worker.mjs';
const response=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
Deno.serve(async req=>{
 if(req.method!=='POST')return response({error:'Use POST.'},405);
 const token=req.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)return response({error:'Worker authorization required.'},401);
 try{
  const server=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const allowed=await server.rpc('ranked_worker_authorized',{p_token:token});
  if(allowed.error||allowed.data!==true)return response({error:'Worker authorization required.'},403);
  const rpc=async(name:string,args:Record<string,unknown>)=>{const {data,error}=await server.rpc(name,args);if(error)throw Error('Ranked operation failed.');return data;};
  const result=await rankedTick(rpc,['ap-south-1']);return response(result);
 }catch{return response({error:'Worker temporarily unavailable.'},503);}
});
