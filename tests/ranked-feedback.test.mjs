import test from 'node:test';import assert from 'node:assert/strict';
import {rankedFailure} from '../lib/ranked-feedback.mjs';
test('connection and conflict failures offer recovery rather than account setup',()=>{
 for(const status of [400,409,429,500,503]){const result=rankedFailure(Object.assign(Error('Recover the match and try again.'),{status}));assert.equal(result.auth,false);assert.equal(result.action,'Try again');}
 assert.equal(rankedFailure(Error('Failed to fetch')).auth,false);
});
test('expired or absent sessions offer sign-in',()=>{
 assert.equal(rankedFailure(Object.assign(Error('Unauthorized'),{status:401})).auth,true);
 assert.equal(rankedFailure(Error('Sign in to enter ranked.')).auth,true);
 assert.equal(rankedFailure(Error('Session expired. Sign in again.')).auth,true);
});
