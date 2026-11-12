import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {OPENING_ART,MATCHMAKING_ART} from '../lib/artwork-assets.mjs';

export const artworkCachePrefix='kamayuu-artwork-';
export function artworkWorker(assets,version){
 return `// Generated from the shipped artwork. No HTML, API responses, or account data.
const CACHE=${JSON.stringify(artworkCachePrefix+version)};
const PREFIX=${JSON.stringify(artworkCachePrefix)};
const ASSETS=new Map(${JSON.stringify(assets.map(a=>[a.path,a.url]))});
async function store(cache,key){
 const response=await fetch(key,{cache:'reload',credentials:'omit'});
 const type=response.headers.get('content-type')||'';
 if(response.ok&&['image/','font/','text/css','application/font','application/x-font','application/octet-stream'].some(prefix=>type.startsWith(prefix))){try{await cache.put(key,response.clone());}catch{}}
 return response;
}
self.addEventListener('install',event=>event.waitUntil((async()=>{
 // WebP is the normal runtime format. Cache GIF fallback only if requested,
 // avoiding an unnecessary second animation download on modern browsers.
 try{const cache=await caches.open(CACHE);await Promise.allSettled([...ASSETS.entries()].filter(([path])=>!path.endsWith('.gif')).map(([,key])=>store(cache,key)));}catch{}
 await self.skipWaiting();
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
 const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url),key=ASSETS.get(url.pathname);
 if(request.method!=='GET'||url.origin!==self.location.origin||!key||request.headers.has('range')||(url.search&&url.pathname+url.search!==key))return;
 event.respondWith((async()=>{
  try{const cache=await caches.open(CACHE);const saved=await cache.match(key);if(saved)return saved;return await store(cache,key);}
  catch{return fetch(request);}
 })());
});
`;
}

export default function artworkCachePlugin(){
 return {
  name:'kamayuu-artwork-cache',apply:'build',
  async generateBundle(){
   const publicDir=path.resolve('public');
   const paths=[...OPENING_ART,...MATCHMAKING_ART,
    '/loaders/opening-deal-v2.gif','/loaders/matchmaking-table-v4.gif',
    '/loaders/opening-compass-still.png','/loaders/matchmaking-cut-still.png',
    '/onboarding-bg.webp','/onboarding-identity-bg.webp',
    '/card-art-quickmatch.png','/card-art-privatetable.png','/card-art-practice.png'];
   for(const folder of ['ranks','fonts'])for(const name of await readdir(path.join(publicDir,folder))){
    if(/\.(webp|png|woff2?|css)$/.test(name))paths.push('/'+folder+'/'+name);
   }
   const assets=[];
   for(const name of paths){
    const bytes=await readFile(path.join(publicDir,name));
    const hash=createHash('sha256').update(bytes).digest('hex').slice(0,16);
    assets.push({path:name,url:name+'?v='+hash,bytes:bytes.length});
   }
   const version=createHash('sha256').update(JSON.stringify(assets)).digest('hex').slice(0,16);
   this.emitFile({type:'asset',fileName:'artwork-sw.js',source:artworkWorker(assets,version)});
   this.emitFile({type:'asset',fileName:'artwork-manifest.json',source:JSON.stringify({version,assets},null,2)});
  },
 };
}
