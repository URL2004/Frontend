import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/js/result-compare.js',import.meta.url),'utf8');
const ctx=vm.createContext({window:{},document:{addEventListener(){}}});
vm.runInContext(source.replace('window.gpResultCompare = { mount: mount,','window.gpResultCompare = { build: build, mount: mount,'),ctx);
const build=ctx.window.gpResultCompare.build;
const reconstruct=(m,side)=>m.rows.map(r=>r[side==='a'?'afterGap':'beforeGap']+r[side].map(s=>s[0]).join('')).join('');
test('alignment preserves line and paragraph boundaries, indentation and table tabs',()=>{
 const before='제목\n  본문을 확인한다.\n같은 문단이다.\n\n항목\t값\n행\t하나';
 const after='제목\n  본문을 검토한다.\n\n별도 문단이다.\n항목\t값\n행\t하나';
 const m=build(before,after);assert.equal(reconstruct(m,'b'),before);assert.equal(reconstruct(m,'a'),after);
 assert.ok(m.rows.some(r=>r.afterGap==='\n\n'));
 assert.notEqual(JSON.stringify(build('첫째다.\n다음이다.','첫째다.\n다음이다.').rows),JSON.stringify(build('첫째다.\n다음이다.','첫째다.\n\n다음이다.').rows));
});
test('grouped and unmatched comparison rows never invent separators',()=>{
 for(const [a,b] of [['하나 둘 셋\n넷 다섯 여섯','하나 둘 셋 넷 다섯 여섯'],['','  새 글이다.\n다음 줄이다.\n\n새 문단이다.'],['원래 문장이다.','추가 문장이다.\n\n원래 문장이다.']]){
  const m=build(a,b);assert.equal(reconstruct(m,'a'),b);assert.equal(reconstruct(m,'b'),a);
 }
});
test('normal effect status does not hide a readability notice',()=>{
 const flow=fs.readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
 const a=flow.indexOf('  function semanticReviewInfo('),b=flow.indexOf('  function renderBadges(',a),c=flow.indexOf('  function renderResultNotices('),e=flow.indexOf('  // ── 완료 화면',c);
 const nodes={};const scope=vm.createContext({$:id=>nodes[id]||(nodes[id]={})});vm.runInContext(flow.slice(a,b)+flow.slice(c,e),scope);
 scope.renderResultNotices({result:{effectStatus:'normal',effectNotices:[{code:'paragraph_readability',message:'문단 간격을 확인해 주세요.'}],qualityStatus:'clean',engineMeta:{semanticValidationStatus:'pass'}}});
 assert.equal(nodes.lavResultEffectNotice.hidden,false);assert.equal(nodes.lavResultEffectNotice.textContent,'문단 간격을 확인해 주세요.');
});
