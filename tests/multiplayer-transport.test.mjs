import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/multiplayer.ts',import.meta.url),'utf8')
 .replace(/^import .*;\r?\n/gm,'')
 .replace('export class MultiplayerService',`const supabaseConfigured=()=>true;
 const auth=()=>({removeChannel:async()=>{}});
 const getSessionId=()=> 'test-session';
 export class MultiplayerService`);
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {MultiplayerService}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);

test('private-table leave stops late packet delivery even if the leave request fails',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,localStorage:globalThis.localStorage};
 const target={addEventListener(){},removeEventListener(){}};
 globalThis.window=target;globalThis.document=target;
 const storage=new Map([['lotus-room','old']]);globalThis.localStorage={removeItem:k=>storage.delete(k)};
 const received=[];const table=new MultiplayerService(p=>received.push(p),()=>{},()=>{});
 let reject;table.request=()=>new Promise((_,no)=>{reject=no;});
 try{
  const leaving=table.leave();const outcome=assert.rejects(leaving,/offline/);
  // Permit channel cleanup to finish and the network notification to start.
  for(let i=0;i<10&&!reject;i++)await Promise.resolve();
  table.receive({room:{id:'old',version:2},events:[]});reject(Error('offline'));await outcome;
  assert.equal(table.closed,true);assert.equal(storage.has('lotus-room'),false);assert.equal(received.length,0);
 }finally{await table.close();Object.assign(globalThis,saved);}
});

test('expired private-table tokens refresh once without signing out or changing the action identity',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const target={addEventListener(){},removeEventListener(){}};globalThis.window=target;globalThis.document=target;
 const table=new MultiplayerService(()=>{},()=>{},()=>{});let signouts=0,refreshes=0,authentications=0;
 table.authenticate=async()=>{authentications++;return {access_token:'old'};};
 table.client.auth={signOut:async()=>{signouts++;},refreshSession:async()=>{refreshes++;return {data:{session:{access_token:'fresh'}},error:null};}};
 const requests=[];globalThis.fetch=async(_url,options)=>{requests.push(options);return new Response(JSON.stringify(requests.length===1?{error:'Session expired'}:{ok:true}),{status:requests.length===1?401:200});};
 try{
  assert.deepEqual(await table.request('action',{action:{type:'draw'}}),{ok:true});
  assert.equal(signouts,0);assert.equal(refreshes,1);assert.equal(authentications,1);
  assert.equal(requests[1].headers.Authorization,'Bearer fresh');assert.equal(requests[0].body,requests[1].body);
 }finally{await table.close();Object.assign(globalThis,saved);}
});

test('unrecoverable private-table authentication does not retry under another identity',async()=>{
 const saved={window:globalThis.window,document:globalThis.document,fetch:globalThis.fetch};
 const target={addEventListener(){},removeEventListener(){}};globalThis.window=target;globalThis.document=target;
 const table=new MultiplayerService(()=>{},()=>{},()=>{});let signouts=0,requests=0;
 table.authenticate=async()=>({access_token:'old'});
 table.client.auth={signOut:async()=>{signouts++;},refreshSession:async()=>({data:{session:null},error:Error('expired refresh')})};
 globalThis.fetch=async()=>{requests++;return new Response(JSON.stringify({error:'Session expired'}),{status:401});};
 try{await assert.rejects(table.request('recover'),/Session expired/);assert.equal(signouts,0);assert.equal(requests,1);}
 finally{await table.close();Object.assign(globalThis,saved);}
});
