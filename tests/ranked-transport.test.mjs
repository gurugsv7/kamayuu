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
