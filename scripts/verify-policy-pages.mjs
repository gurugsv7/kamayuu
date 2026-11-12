import {readFile,access} from 'node:fs/promises';
import assert from 'node:assert/strict';
const base=process.argv[2];
const pages=[['privacy','Privacy Policy'],['terms','Terms of Use'],['parents','Information for Parents'],['delete-account','Delete Your Account or Data']];
for(const [name,title] of pages){
 let html;
 if(base){const response=await fetch(new URL('/'+name+'.html',base));assert.equal(response.status,200,name);assert.match(response.headers.get('content-type')||'',/text\/html/);html=await response.text();}
 else html=await readFile('dist-vercel/'+name+'.html','utf8');
 assert.ok(html.includes('<title>'+title+' — Kamayuu</title>'),name+' serves its own document');
 assert.ok(html.includes('https://kamayuu.builtbygsv.in/'+name+'.html'),name+' canonical');
 assert.ok(html.includes('builtbygsv@gmail.com'),name+' contact');
 assert.ok(!/pre-release draft|YOUR_PROJECT|REPLACE_ME|must be finalized|provider has not yet been selected/i.test(html),name+' has no unfinished copy');
 assert.ok(!/<script\b/i.test(html),name+' is readable without JavaScript');
 const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
 for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.has(match[1]),name+' anchor '+match[1]);
 if(!base)for(const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)){if(match[1]!=='/')await access('dist-vercel'+match[1]);}
 console.log(name+': document, links, contact and metadata verified');
}
if(base){const css=await fetch(new URL('/legal.css',base));assert.equal(css.status,200);assert.match(css.headers.get('content-type')||'',/text\/css/);const home=await fetch(new URL('/',base));assert.equal(home.status,200);const html=await home.text();assert.ok(html.includes('/privacy.html')&&html.includes('/terms.html'),'homepage contains legal links');}
else{const home=await readFile('dist-vercel/index.html','utf8');assert.ok(home.includes('/privacy.html')&&home.includes('/terms.html'),'homepage contains legal links');}
console.log('All policy-page checks passed.');
