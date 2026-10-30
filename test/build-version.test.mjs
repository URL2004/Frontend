import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVersion} from '../scripts/build-version.mjs';
test('CLI builds identify their checkout, and missing Git is explicitly unknown',()=>{
 assert.equal(buildVersion({},()=> 'a'.repeat(40)),'a'.repeat(12));
 assert.equal(buildVersion({},()=>{throw Error('no git')}),'build-unknown');
 assert.equal(buildVersion({},()=> 'not a commit'),'build-unknown');
 assert.equal(buildVersion({VITE_BUILD_VERSION:'release-129',VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},()=>{throw Error('not needed')}),'release-129');
 assert.equal(buildVersion({VERCEL_GIT_COMMIT_SHA:'b'.repeat(40)},()=> ''),'b'.repeat(40));
});
