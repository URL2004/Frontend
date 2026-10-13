import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const start=source.indexOf('function adminExecutionDurationRow('),end=source.indexOf('function renderAdminJobs(',start);
const scope={adminQualityDuration:n=>n+'ms'};vm.runInNewContext(source.slice(start,end)+';globalThis.read=adminExecutionDurationRow',scope);
test('admin distinguishes complete execution evidence, partial evidence and absent records',()=>{
 assert.deepEqual(Array.from(scope.read({executionDurationCoverage:'complete',executionDurationMs:35000,processingDurationMs:1300000})),['실제 실행 시간','35000ms']);
 assert.match(scope.read({executionDurationCoverage:'partial',observedExecutionDurationMs:10000})[1],/10000ms 이상/);
 assert.equal(scope.read({processingDurationMs:1300000})[1],'기록 없음');
 assert.equal(scope.read({executionDurationCoverage:'complete',executionDurationMs:0})[1],'0ms');
});
