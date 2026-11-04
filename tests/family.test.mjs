import test from 'node:test';
import assert from 'node:assert/strict';
import {familyPermissions,enforceFamily,familyPacket,FAMILY_NOTICE,readFamilyResponse} from '../lib/family-policy.mjs';
import {consentProvider,verifiedConsent} from '../lib/family-consent.mjs';
const child={age_band:'under_13',consent:true,online_allowed:true,social_allowed:false,rematches_allowed:false};
test('missing or malformed account services fail with a usable message instead of a parser error',async()=>{
 await assert.rejects(()=>readFamilyResponse({json:async()=>{throw Error('Unexpected token <');}}),/Practice is available offline/);
 await assert.rejects(()=>readFamilyResponse({ok:false,json:async()=>({error:'Parent approval expired'})}),/Parent approval expired/);
 assert.deepEqual(await readFamilyResponse({ok:true,json:async()=>({age_band:'under_13'})}),{age_band:'under_13'});
});
test('unknown ages and unapproved children have no online or analytics access',()=>{
 for(const account of [null,{}, {age_band:'under_13'}, {...child,revoked:true}]){
  assert.equal(familyPermissions(account).online,false);assert.equal(familyPermissions(account).analytics,false);
  assert.throws(()=>enforceFamily(account,{command:'enqueue'}));
 }
 assert.equal(familyPermissions(child).online,true);assert.equal(familyPermissions(child).analytics,false);
 assert.equal(familyPermissions({age_band:'13_17'}).online,true);
});
test('parent toggles control reactions and rematches without disabling gameplay',()=>{
 for(const command of ['emote','message','rematch'])assert.throws(()=>enforceFamily(child,{command}));
 assert.equal(enforceFamily(child,{command:'action'}),true);
 assert.equal(enforceFamily(child,{command:'rematch',response:'decline'}),true);
 assert.equal(enforceFamily({...child,rematches_allowed:true},{command:'rematch',response:'accept'}),true);
});
test('child packets redact names and unwanted reactions including ranked nested packets',()=>{
 const packet={room:{members:[{name:'My phone 123'},{name:'Real Name'}],rematch:{}},state:{players:[{name:'Me'},{name:'School Name'}]},events:[{type:'draw'},{type:'message',text:'Call me'},{type:'emote',name:'cool'}],social:[{type:'message',text:'Call me'}]};
 const safe=familyPacket({packet,rematch:{},nextMatchId:'id'},child);
 assert.equal(safe.packet.room.members[0].name,'Player 1');assert.equal(safe.packet.state.players[1].name,'Player 2');
 assert.deepEqual(safe.packet.events,[{type:'draw'}]);assert.deepEqual(safe.packet.social,[]);assert.equal(safe.rematch,null);
 assert.equal(packet.room.members[0].name,'My phone 123');
 assert.equal(familyPacket(packet,{...child,revoked:true}).accessRevoked,true);
 const enabled=familyPacket({...packet,events:[{type:'message',text:'Call me'},{type:'message',text:'Nice move!'}]},{...child,social_allowed:true});
 assert.deepEqual(enabled.events,[{type:'message',text:'Nice move!'}]);
});
test('consent rejects device mismatch, expiry, checkbox-only approval and old notices',()=>{
 const hash='a'.repeat(64),grant={verified:true,noticeVersion:FAMILY_NOTICE,deviceHash:hash,receipt:'verified-receipt',guardian:'verified-parent',expiresAt:'2030-01-01T00:00:00Z',online:true};
 assert.equal(verifiedConsent(grant,hash).online,true);
 for(const patch of [{verified:false},{noticeVersion:'old'},{deviceHash:'b'.repeat(64)},{guardian:''},{expiresAt:'2020-01-01'}])assert.throws(()=>verifiedConsent({...grant,...patch},hash));
});
test('unconfigured verification is blocked, and provider failure never grants access',async()=>{
 await assert.rejects(()=>consentProvider(null,null)('verify',{}),/not configured/);
 await assert.rejects(()=>consentProvider('https://vpc.example','secret',async()=>({ok:false}))('verify',{}));
 let request;const provider=consentProvider('https://vpc.example','secret',async(url,options)=>{request={url,...options};return {ok:true,json:async()=>({verified:false})};});
 assert.equal((await provider('verify',{session:'s'})).verified,false);
 assert.equal(JSON.parse(request.body).noticeVersion,FAMILY_NOTICE);assert.equal(request.headers.Authorization,'Bearer secret');
});
