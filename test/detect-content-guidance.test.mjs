import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const flow=fs.readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
test('content evidence labels describe observations rather than ordering unsupported additions',()=>{
 const text=flow.slice(flow.indexOf('  function contentEvidenceLabel'),flow.indexOf('  function buildReportModel'));
 const context=vm.createContext({});vm.runInContext(text,context);
 for(const status of ['strong','mixed','weak','not_assessed','limited']) {
  assert.doesNotMatch(context.contentEvidenceLabel(status),/보강|충분$/);
 }
 assert.match(context.contentEvidenceLabel('not_assessed'),/측정 안 함/);
 assert.doesNotMatch(flow,/contentLabel \+= ' · 보강 권장'/);
 assert.doesNotMatch(flow,/프로젝트 경험은 유지하고, 반복되는 종결/);
});
test('legacy tips do not turn missing rhythm measurements into zero or add experience to unknown genres',()=>{
 const text=flow.slice(flow.indexOf('  function repBuildTips'),flow.indexOf('  // ── 전환 밴드'));
 const context=vm.createContext({repAxisPolicy:()=>({anchor:{status:'off'},stance:{status:'off'}})});
 vm.runInContext(text,context);
 const tips=context.repBuildTips({measured:{lengthCV:null},content:{total:10,generic:8}}).join(' ');
 assert.doesNotMatch(tips,/길이가 고르게|실제로 겪은|더해 보세요/);
 assert.match(tips,/앞뒤 문맥/);
 assert.match(flow,/setStat\('gpRepStatRhythm', measured\.lengthCV != null && Number\.isFinite/);
 assert.match(flow,/key === 'uniform'\) return m\.lengthCV != null && Number\.isFinite/);
});
