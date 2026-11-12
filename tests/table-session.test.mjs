import test from 'node:test';
import assert from 'node:assert/strict';
import {TableSession} from '../lib/table-session.mjs';

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};

test('leaving discards queued turns even when the current animation settles later',async()=>{
 const session=new TableSession(),animation=deferred(),shown=[];
 const playing=session.enqueue(async()=>{shown.push('animation started');await animation.promise;});
 const late=session.enqueue(()=>shown.push('old turn reopens table'));
 await Promise.resolve();session.reset();shown.push('home');
 animation.resolve();await Promise.all([playing,late]);
 assert.deepEqual(shown,['animation started','home']);
});

test('old packets, connection and presence callbacks stay invalid after another table opens',async()=>{
 const session=new TableSession(),seen=[];
 const oldPacket=session.guard(packet=>session.enqueue(()=>seen.push(packet)));
 const oldStatus=session.guard(status=>seen.push(status));
 session.reset();
 const newPacket=session.guard(packet=>session.enqueue(()=>seen.push(packet)));
 oldPacket('old recover');oldStatus('old connected');
 await newPacket('new table');
 assert.deepEqual(seen,['new table']);
});

test('a rematch discards the previous hand queue while keeping its transport connected',async()=>{
 const session=new TableSession(),animation=deferred(),seen=[];
 const receive=session.guard(packet=>session.enqueue(()=>seen.push(packet)));
 const playing=session.enqueue(()=>animation.promise);
 const old=receive('old hand');await Promise.resolve();session.clearQueue();
 await receive('rematch deal');animation.resolve();await Promise.all([playing,old]);
 assert.deepEqual(seen,['rematch deal']);
});

test('current table presents turns in order and continues after a failed presentation',async()=>{
 const session=new TableSession(),seen=[];
 session.enqueue(()=>{seen.push('draw');throw Error('animation failed');});
 session.enqueue(()=>seen.push('discard'));await session.enqueue(()=>seen.push('next turn'));
 assert.deepEqual(seen,['draw','discard','next turn']);
});
