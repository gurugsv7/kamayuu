import test from 'node:test';
import assert from 'node:assert/strict';
import {rankProgress} from '../lib/rank-display.mjs';
import {TIERS,MAX_RATING} from '../lib/ranked-config.mjs';

test('starting rating shows the actual gap to Silver',()=>{
 const r=rankProgress(600);
 assert.equal(r.tier.id,'bronze');assert.equal(r.next.id,'silver');
 assert.equal(r.remaining,300);assert.equal(r.fraction,2/3);
});
test('promotions reset progress at every server tier boundary',()=>{
 for(const t of TIERS.slice(1)){
  assert.equal(rankProgress(t.floor-1).next.id,t.id);
  const r=rankProgress(t.floor);
  assert.equal(r.tier.id,t.id);
  assert.equal(r.fraction,t.id==='diamond'?1:0);
 }
});
test('Diamond does not invent an additional tier or rating target',()=>{
 for(const n of [1800,MAX_RATING]){
  const r=rankProgress(n);assert.equal(r.next,null);assert.equal(r.remaining,0);assert.equal(r.fraction,1);
 }
});
test('invalid ratings cannot produce a misleading progress bar',()=>{
 for(const n of [-1,NaN,Infinity,MAX_RATING+1])assert.throws(()=>rankProgress(n));
});
