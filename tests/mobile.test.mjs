import test from 'node:test';
import assert from 'node:assert/strict';
import {backAction,soloCanAdvance,secureAuthStorage} from '../lib/mobile-policy.mjs';
test('Android back dismisses transient UI before touching a game and minimizes only at the home menu',()=>{
 assert.equal(backAction({panel:'settings',tutorial:true,menu:false,online:'room'}),'close-panel');
 assert.equal(backAction({tutorial:true,menu:false}),'close-tutorial');
 assert.equal(backAction({menu:false}),'settings');
 assert.equal(backAction({menu:true,online:'room'}),'settings');
 assert.equal(backAction({menu:true}),'minimize');
});
test('solo deadlines pause in native background, hidden WebView or settings; foreground resumes without changing speed',()=>{
 assert.equal(soloCanAdvance({hidden:false,active:true,panel:false}),true);
 for(const blocked of [{hidden:true,active:true,panel:false},{hidden:false,active:false,panel:false},{hidden:false,active:true,panel:true}])assert.equal(soloCanAdvance(blocked),false);
});
test('auth storage uses only the native bridge, supports async refresh/logout and propagates failures without plaintext fallback',async()=>{
 const vault=new Map();const calls=[];
 const storage=secureAuthStorage({getItem:async({key})=>({value:vault.get(key)??null}),setItem:async({key,value})=>{calls.push('native-write');vault.set(key,value);},removeItem:async({key})=>{vault.delete(key);}});
 assert.equal(await storage.getItem('lotus-guest-test'),null);await storage.setItem('lotus-guest-test','first');await storage.setItem('lotus-guest-test','refresh');assert.equal(await storage.getItem('lotus-guest-test'),'refresh');await storage.removeItem('lotus-guest-test');assert.equal(await storage.getItem('lotus-guest-test'),null);assert.equal(calls.length,2);
 const failed=secureAuthStorage({setItem:async()=>{throw Error('keystore unavailable');}});await assert.rejects(()=>failed.setItem('key','token'),/keystore unavailable/);
});
