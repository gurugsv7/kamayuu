import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.transpileModule(readFileSync(new URL('../lib/account.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture({age='18_plus',online=true,captcha='fresh-token',error=null,setupError=false}={}){
 const calls=[];const session={user:{id:'ordinary-player'}};
 const modules={
  '@supabase/supabase-js':{createClient:()=>({auth:{signInWithPassword:async args=>{calls.push(['password',args]);return {data:{session:error?null:session},error};},signOut:async()=>{calls.push(['logout']);return {};}}})},
  './captcha':{captchaToken:async()=>{calls.push(['captcha']);return captcha;}},
  './family':{storedAge:()=>age,clearFamilyState:()=>calls.push(['clear']),setupAge:async()=>{calls.push(['age']);if(setupError)throw Error('Age setup failed');}},
  './family-policy.mjs':{},
  './native':{isNative:()=>false,connectionAvailable:()=>online},
 };
 const exports={};vm.runInNewContext(source,{exports,require:name=>{if(!(name in modules))throw Error(name);return modules[name];},process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'test-public'}},localStorage:{removeItem:()=>{}}});
 return {login:exports.signInReviewer,calls,session};
}
test('reviewer login cannot bypass age, offline, or empty credential checks',async()=>{
 for(const opts of [{age:null},{age:'under_13'},{online:false}]){const f=fixture(opts);await assert.rejects(f.login('review@example.invalid','password'));assert.equal(f.calls.length,0);}
 const f=fixture();await assert.rejects(f.login(' ','password'));assert.equal(f.calls.length,0);
});
test('reviewer uses normal password authentication with a fresh CAPTCHA and family registration',async()=>{
 const f=fixture();assert.equal(await f.login(' review@example.invalid ',' pass '),f.session);
 assert.deepEqual(f.calls.map(c=>c[0]),['captcha','password','clear','age']);
 assert.equal(f.calls[1][1].email,'review@example.invalid');assert.equal(f.calls[1][1].password,' pass ');assert.equal(f.calls[1][1].options.captchaToken,'fresh-token');
});
test('invalid credentials and rate limits are actionable without exposing backend details',async()=>{
 for(const [error,message] of [[{code:'invalid_credentials'},/Check your email/],[{status:429},/Too many attempts/],[{code:'captcha_failed'},/verification check/]]){const f=fixture({error});await assert.rejects(f.login('review@example.invalid','wrong'),message);assert.equal(f.calls.some(c=>c[0]==='age'),false);}
});
test('failed family registration signs out the new session',async()=>{
 const f=fixture({setupError:true});await assert.rejects(f.login('review@example.invalid','password'),/Age setup failed/);assert.ok(f.calls.some(c=>c[0]==='logout'));
});
