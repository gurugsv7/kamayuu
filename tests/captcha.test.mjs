import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';
import {readFileSync} from 'node:fs';
const source=ts.transpileModule(readFileSync(new URL('../lib/captcha.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function fixture(){
 const scripts=[],calls=[],timers=[];const window={};const exports={};
 const document={createElement:()=>({setAttribute(){},remove(){this.removed=true;}}),head:{appendChild:s=>scripts.push(s)},body:{appendChild(){}}};
 vm.runInNewContext(source,{exports,window,document,process:{env:{NEXT_PUBLIC_HCAPTCHA_SITEKEY:'public-test-key'}},setTimeout:f=>{timers.push(f);return timers.length;},clearTimeout(){}});
 const ready=()=>{window.hcaptcha={render:()=>{calls.push('render');return 'widget';},reset:()=>calls.push('reset'),execute:async()=>({response:'fresh-token'})};window.kamayuuCaptchaReady();};
 return {exports,scripts,calls,timers,ready};
}
test('CAPTCHA rendering waits for SDK ready and reuses the loaded widget',async()=>{
 const f=fixture();const pending=f.exports.captchaToken();await Promise.resolve();assert.deepEqual(f.calls,[]);assert.match(f.scripts[0].src,/onload=kamayuuCaptchaReady/);f.ready();assert.equal(await pending,'fresh-token');assert.equal(await f.exports.captchaToken(),'fresh-token');assert.deepEqual(f.calls,['render','reset','reset']);assert.equal(f.scripts.length,1);
});
test('failed CAPTCHA script load can retry without remaining stuck',async()=>{
 const f=fixture();const failed=f.exports.captchaToken();f.scripts[0].onerror();await assert.rejects(failed,/Could not load/);assert.equal(f.scripts[0].removed,true);const retry=f.exports.captchaToken();assert.equal(f.scripts.length,2);f.ready();assert.equal(await retry,'fresh-token');
});
test('a hung CAPTCHA SDK load has a bounded error instead of an endless spinner',async()=>{
 const f=fixture();const pending=f.exports.captchaToken();f.timers[0]();await assert.rejects(pending,/Could not load/);
});
