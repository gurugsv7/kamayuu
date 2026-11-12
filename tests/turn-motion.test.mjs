import test from 'node:test';import assert from 'node:assert/strict';import {turnFlights} from '../lib/turn-motion.mjs';
const face={id:'4♥',rank:'4',suit:'♥'};
test('turn-ending discards and replacements retain movement with public outgoing faces',()=>{
 assert.deepEqual(turnFlights([{type:'discard',p:1,card:face}]),[{from:'held1',to:'discard',card:face,p:1}]);
 const own=turnFlights([{type:'replace',p:0,i:2,card:face,old:face}]);assert.equal(own.length,2);assert.equal(own[1].card,face);
 const other=turnFlights([{type:'replace',p:1,i:2,card:face,old:face,public:false}]);assert.equal(other[0].card,face);assert.equal(other[1].card,null);
});
test('Queen and peek movement uses only faces already visible to this viewer',()=>{
 const privateSwap=turnFlights([{type:'swap',p:0,target:1,i:0,incoming:face,outgoing:face}]);assert.ok(privateSwap.every(f=>f.card===face));
 const spectatorSwap=turnFlights([{type:'swap',p:1,target:0,i:0}]);assert.ok(spectatorSwap.every(f=>f.card===null));
 assert.equal(turnFlights([{type:'peek',p:1,i:0}])[0].card,null);
});
test('matching moves to discard or takes the penalty; unrelated events fabricate no movement',()=>{
 assert.equal(turnFlights([{type:'match',p:1,i:0,ok:true,card:face}])[0].to,'discard');
 assert.equal(turnFlights([{type:'match',p:1,i:0,ok:false,penaltyIndex:4,penalty:face}])[0].to,'p1-4');
 assert.deepEqual(turnFlights([{type:'message'},{type:'emote'},{type:'pass'}]),[]);
});
