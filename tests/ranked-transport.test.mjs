import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync(new URL('../lib/ranked.ts',import.meta.url),'utf8').replace("import {onlineSession} from './account';",'const onlineSession=async()=>null;');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {RankedTable}=await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`);
const packet=(id,version,phase='ready')=>({room:{id,version,me:'seat-0',members:[{id:'seat-0'},{id:'seat-1'}]},state:{phase,active:0,turn:1},events:[]});

test('ranked transport follows a rematch and ignores late packets from its previous game',()=>{
 const received=[];const table=new RankedTable('old',p=>received.push(p),()=>{},()=>{});
 table.receive({packet:packet('old',5)});assert.equal(table.version,5);
 table.receive({nextMatchId:'new'});assert.equal(table.matchId,'new');assert.equal(table.version,-1);
 table.receive({packet:packet('old',6)});assert.equal(table.version,-1);
 table.receive({packet:packet('new',1,'memory')});assert.equal(table.lastState.phase,'memory');assert.equal(received.length,2);
 table.receive({packet:packet('old',7)});assert.equal(table.room.id,'new');
});

test('metadata and social updates do not replay a game version; closed transport ignores responses',()=>{
 const received=[];const table=new RankedTable('game',p=>received.push(p),()=>{},()=>{});
 table.receive({packet:packet('game',1)});table.receive({packet:packet('game',1)});
 assert.equal(received[0].metaOnly,false);assert.equal(received[1].metaOnly,true);
 table.closed=true;table.receive({packet:packet('game',2)});assert.equal(table.version,1);
});

test('polling across an acknowledgment recovers a transition once and does not replay it',()=>{
 const received=[];const table=new RankedTable('game',p=>received.push(p),()=>{},()=>{});table.receive({packet:packet('game',1)});
 const recovered={...packet('game',3),room:{...packet('game',3).room,presentationId:1},events:[{type:'discard',p:1}],recover:true,presentationReplay:true};
 table.receive({packet:structuredClone(recovered)});assert.equal(received.at(-1).recover,false);assert.equal(received.at(-1).events.length,1);
 table.receive({packet:structuredClone(recovered)});assert.equal(received.at(-1).events.length,0);assert.equal(received.at(-1).metaOnly,true);
});

test('leaving closes packet delivery before its delayed rematch response arrives',async()=>{
 const priorWindow=globalThis.window,priorDocument=globalThis.document;
 globalThis.window={removeEventListener(){}};globalThis.document={removeEventListener(){}};
 try{
  const received=[];const table=new RankedTable('old',p=>received.push(p),()=>{},()=>{});
  table.receive({packet:packet('old',5,'finished')});let release;
  table.client.command=async(id,command)=>{assert.equal(id,'old');assert.equal(command,'rematch');return new Promise(r=>{release=r;});};
  const leaving=table.leave();assert.equal(table.closed,true);await Promise.resolve();
  release({packet:packet('old',6,'finished'),nextMatchId:'unwanted'});await leaving;
  assert.equal(received.length,1);assert.equal(table.version,5);assert.equal(table.matchId,'old');
 }finally{globalThis.window=priorWindow;globalThis.document=priorDocument;}
});

test('failed initial ranked recovery rejects entry and removes listeners without polling an empty table',async()=>{
 const priorWindow=globalThis.window,priorDocument=globalThis.document;
 const listeners=new Set();
 const target={addEventListener(name,fn){listeners.add(fn);},removeEventListener(name,fn){listeners.delete(fn);}};
 globalThis.window=target;globalThis.document=target;
 const table=new RankedTable('game',()=>{},()=>{},()=>{});
 table.client.recover=async()=>{throw Error('Session expired');};
 try{
  await assert.rejects(table.enter(),/Session expired/);
  assert.equal(table.closed,true);assert.equal(listeners.size,0);assert.equal(table.timer,undefined);
 }finally{await table.close();globalThis.window=priorWindow;globalThis.document=priorDocument;}
});

test('an in-flight failed recovery cannot change connection status after ranked table closes',async()=>{
 const priorWindow=globalThis.window,priorDocument=globalThis.document;
 globalThis.window={removeEventListener(){}};globalThis.document={removeEventListener(){}};
 const statuses=[];const table=new RankedTable('game',()=>{},s=>statuses.push(s),()=>{});
 let reject;table.client.recover=()=>new Promise((_,no)=>{reject=no;});
 try{const pending=table.recover();await table.close();reject(Error('offline'));await pending;assert.deepEqual(statuses,[]);}
 finally{globalThis.window=priorWindow;globalThis.document=priorDocument;}
});
