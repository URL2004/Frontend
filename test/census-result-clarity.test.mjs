import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
const start=source.indexOf('  function semanticReviewInfo('),end=source.indexOf('  function renderBadges(',start);
const context=vm.createContext({});vm.runInContext(source.slice(start,end),context);
test('only final candidate pass creates the semantic pass badge',()=>{
 assert.equal(context.semanticReviewInfo({engineMeta:{semanticValidationStatus:'pass'}}).status,'pass');
 for(const status of ['skipped','fail','uncertain','stale','unknown'])assert.notEqual(context.semanticReviewInfo({engineMeta:{semanticValidationStatus:status}}).status,'pass');
 assert.notEqual(context.semanticReviewInfo({floorReport:{metrics:{judge:'pass'}}}).status,'pass');
});
test('paragraph refinement supersedes any stale whole-document pass',()=>{
 const r=context.semanticReviewInfo({auditScope:'refined_paragraph',engineMeta:{semanticValidationStatus:'pass'}});
 assert.equal(r.status,'partial');assert.match(r.message,/전체의 의미는 다시 검사하지/u);
});
test('missing warnings cannot hide a needs-review outcome',()=>{
 assert.doesNotMatch(source,/=== 'needs_review' && qualityWarnings\.length > 0/u);
 assert.match(source,/qualityWarnings\[0\] && qualityWarnings\[0\]\.message/u);
 assert.match(source,/humanizationNoBenefitDelivered/u);
});
