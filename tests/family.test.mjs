import test from 'node:test';
import assert from 'node:assert/strict';
import {familyPermissions,enforceFamily,familyPacket,FAMILY_NOTICE,readFamilyResponse} from '../lib/family-policy.mjs';
import {consentProvider,verifiedConsent} from '../lib/family-consent.mjs';
const child={age_band:'under_13',consent:true,online_allowed:true,social_allowed:false,rematches_allowed:false};
test('legacy private-table compatibility never bypasses known child controls or enables unknown-age analytics',()=>{
 assert.equal(enforceFamily({}, {command:'create'}, {allowLegacyUnknown:true}),true);
 assert.equal(enforceFamily({}, {command:'track'}, {allowLegacyUnknown:true}),false);
 assert.throws(()=>enforceFamily({}, {command:'enqueue'}));
 assert.throws(()=>enforceFamily({age_band:'under_13'}, {command:'join'}, {allowLegacyUnknown:true}));
 assert.throws(()=>enforceFamily({...child,revoked:true}, {command:'join'}, {allowLegacyUnknown:true}));
 assert.throws(()=>enforceFamily(child, {command:'message'}, {allowLegacyUnknown:true}));
});
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
 assert.equal(familyPermissions(child).online,false);assert.equal(familyPermissions(child).analytics,false);
 assert.equal(familyPermissions({age_band:'13_17'}).online,true);
});
test('under-13 online access stays disabled despite historical parental consent',()=>{
 for(const account of [child,{...child,social_allowed:true,rematches_allowed:true}]){
  for(const command of ['create','join','enqueue','action','emote','message','rematch'])assert.throws(()=>enforceFamily(account,{command}),/13 and above/);
  assert.equal(familyPermissions(account).online,false);
  assert.equal(familyPermissions(account).analytics,false);
 }
 assert.equal(enforceFamily(child,{command:'leave'}),true);
 assert.equal(enforceFamily(child,{command:'cancel'}),true);
});

test('under-13 packets cannot expose online data even with an old consent receipt',()=>{
 const packet={room:{members:[{name:'Real Name'}]},state:{players:[{name:'School Name'}]}};
 assert.deepEqual(familyPacket(packet,child),{accessRevoked:true});
 assert.deepEqual(familyPacket({packet,rematch:{},nextMatchId:'id'},child),{accessRevoked:true});
 assert.equal(familyPacket(packet,{age_band:'18_plus'}),packet);
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
