import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {artworkWorker,artworkCachePrefix} from '../scripts/artwork-cache-plugin.mjs';
import {warmArtwork} from '../lib/artwork-assets.mjs';

function worker({version='v1',stores=new Map(),bad=false,full=false}={}){
 const events={},requests=[],deleted=[];
 const assets=[{path:'/loaders/test.webp',url:'/loaders/test.webp?v=hash'}];
 const caches={
  open:async key=>{
   if(!stores.has(key))stores.set(key,new Map());
   const data=stores.get(key);
   return {put:async(key,value)=>{if(full)throw Error('quota');data.set(key,value);},match:async key=>data.get(key)};
  },
  keys:async()=>[...stores.keys()],delete:async key=>{deleted.push(key);return stores.delete(key);},
 };
 let offline=false;
 vm.runInNewContext(artworkWorker(assets,version),{
  self:{location:{origin:'https://kamayuu.test'},addEventListener:(name,handler)=>{events[name]=handler;},skipWaiting:async()=>{},clients:{claim:async()=>{}}},
  caches,URL,fetch:async(url,options)=>{requests.push({url,options});if(offline)throw Error('offline');return new Response(bad?'missing':'image',{status:200,headers:{'content-type':bad?'text/html':'image/webp'}});},
 });
 const lifecycle=event=>new Promise((resolve,reject)=>events[event]({waitUntil:p=>p.then(resolve,reject)}));
 const fetch=(path,options={})=>{let response;events.fetch({request:new Request(new URL(path,'https://kamayuu.test'),options),respondWith:p=>{response=p;}});return response;};
 return {lifecycle,fetch,requests,stores,deleted,offline:()=>{offline=true;}};
}

test('installed artwork renders offline without another network fetch',async()=>{
 const w=worker();await w.lifecycle('install');assert.equal(w.requests.length,1);w.offline();
 const response=await w.fetch('/loaders/test.webp');assert.equal(await response.text(),'image');assert.equal(w.requests.length,1);
});
test('artwork worker never intercepts API, accounts, HTML, external images or writes',()=>{
 const w=worker();
 for(const url of ['/','/privacy.html','/api/profile','https://other.test/loaders/test.webp','/loaders/test.webp?size=20'])assert.equal(w.fetch(url),undefined);
 assert.equal(w.fetch('/loaders/test.webp',{method:'POST'}),undefined);
 assert.equal(w.fetch('/loaders/test.webp',{headers:{Range:'bytes=0-20'}}),undefined);
});
test('artwork update removes only its obsolete artwork cache',async()=>{
 const stores=new Map([[artworkCachePrefix+'v1',new Map()],['unrelated-cache',new Map()]]);
 const w=worker({version:'v2',stores});await w.lifecycle('install');await w.lifecycle('activate');
 assert.deepEqual(w.deleted,[artworkCachePrefix+'v1']);assert.ok(stores.has('unrelated-cache'));assert.ok(stores.has(artworkCachePrefix+'v2'));
});
test('a missing image rewritten to HTML cannot poison the artwork cache',async()=>{
 const w=worker({bad:true});await w.lifecycle('install');assert.equal(w.stores.get(artworkCachePrefix+'v1').size,0);
});
test('full cache storage still displays a successful image without downloading it twice',async()=>{
 const w=worker({full:true});const response=await w.fetch('/loaders/test.webp');
 assert.equal(await response.text(),'image');assert.equal(w.requests.length,1);
});
test('splash warmup settles on errors, hung images and decode failure',async()=>{
 class ErrorImage{set src(value){queueMicrotask(()=>this.onerror?.());}}
 class HungImage{set src(value){}}
 class BadDecode{set src(value){queueMicrotask(()=>this.onload?.());}decode(){throw Error('decode');}}
 await warmArtwork(['/error.webp'],{ImageClass:ErrorImage,timeoutMs:10});
 await warmArtwork(['/hung.webp'],{ImageClass:HungImage,timeoutMs:10});
 await warmArtwork(['/decode.webp'],{ImageClass:BadDecode,timeoutMs:10});
});
