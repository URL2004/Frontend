import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
const flow=readFileSync(new URL('../assets/js/evasion-flow.js',import.meta.url),'utf8');
function renderer(){
 const c=vm.createContext({});
 vm.runInContext(app.slice(app.indexOf('function escapeHtml('),app.indexOf('window.escapeHtml ='))
  +app.slice(app.indexOf('function adminLedgerDetailPairs('),app.indexOf('function adminRenderLedgerDetail('))
  +app.slice(app.indexOf('function adminRenderBlockedEvidence('),app.indexOf('window.adminOpenBlockedDetail =')),c);
 return c.adminRenderBlockedEvidence;
}
test('blocked original, candidate and failed recovery evidence are escaped and explicitly undelivered',()=>{
 const render=renderer(),attack='<img src=x onerror=alert(1)>';
 const result=render({job:{id:'job',stage:'stopped',deducted:false},evidence:{available:true,source:attack,candidate:attack,
  audit:{available:true,status:'fail',windows:[]},recovery:[{candidate:attack,accepted:false,trace:{status:'uncertain',windows:[]}}]}});
 assert.doesNotMatch(result,/<img/);assert.match(result,/&lt;img/);assert.match(result,/미전달 결과/);assert.match(result,/복원 시도 1 · 미채택/);
 assert.match(result,/판단 보류/);
});
test('historical missing blocked evidence is not fabricated or called a passing result',()=>{
 const result=renderer()({job:{deducted:false},evidence:{available:false,reason:'not_recorded'},retainedSource:'옛 원문'});
 assert.match(result,/저장되어 있지 않습니다/);assert.match(result,/확정할 수 없습니다/);assert.match(result,/옛 원문/);
 assert.doesNotMatch(result,/전달하지 않은 생성 결과/);
});
test('engine failure does not blame source experience, preserves original and clears stale advice',()=>{
 const elements=new Map();const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,textContent:'stale',value:'stale memo',innerHTML:'',querySelector(){return {textContent:'',innerHTML:''};},appendChild(){}});return elements.get(id);};
 const c={window:{UP:'free',UC:100},$:element,setActiveJobUi(){},document:{createElement:()=>({})}};vm.createContext(c);
 vm.runInContext(flow.slice(flow.indexOf('function renderBlockOffer('),flow.indexOf('// 메모 반영해 다시 시도')),c);
 c.renderBlockOffer('synthetic-job',{mode:'polish',reason:'평가 표현이 추가됐어요.',gates:['polish_evaluative_padding_added'],blockOffer:{abstractParas:[{snippet:'engine unrelated'}],canEvidence:true}});
 assert.equal(element('lavBlockedMemo').hidden,true);assert.equal(element('lavBlockedMemo').value,'');assert.equal(element('lavBlockedAbstract').hidden,true);
 assert.equal(element('lavBlockedEvidence').hidden,true);assert.equal(element('lavBlockedFallback').hidden,true);
 assert.match(element('lavBlockedReason').textContent,/평가 표현/);assert.match(element('lavBlockedReason').textContent,/synthetic-job/);assert.match(element('lavBlockedReason').textContent,/차감되지/);
 c.renderBlockOffer('next-job',{mode:'formal',gates:['internal_marker_leak'],blockOffer:{}});
 assert.doesNotMatch(element('lavBlockedReason').textContent,/평가 표현|synthetic-job/);
 for (const mode of ['formal','blog','polish']) {
  c.renderBlockOffer('retry-job',{mode,blockOffer:{retryOffer:true,retryCredit:20}});
  assert.equal(element('lavBlockedFallback').hidden,false);
  assert.match(element('lavBlockedFallback').textContent,/같은 모드/u);
  assert.doesNotMatch(element('lavBlockedFallback').textContent,/다듬기/u);
 }
 c.renderBlockOffer('legacy-job',{mode:'blog',blockOffer:{fallbackOffer:true,fallbackCredit:10}});
 assert.equal(element('lavBlockedFallback').hidden,true,'old cached offers cannot downgrade');
 c.window.UC = 0;
 c.renderBlockOffer('coupon-job',{mode:'formal',billingMode:'coupon',blockOffer:{retryOffer:true,retryCredit:1}});
 assert.match(element('lavBlockedFallback').textContent,/이용권 1회/u);
 assert.doesNotMatch(element('lavBlockedFallback').textContent,/크레딧|충전/u);
});
