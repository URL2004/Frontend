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
 const context=vm.createContext({window:{},repAxisPolicy:()=>({anchor:{status:'off'},stance:{status:'off'}})});
 vm.runInContext(text,context);
 const tips=context.repBuildTips({measured:{lengthCV:null},content:{total:10,generic:8}}).join(' ');
 assert.doesNotMatch(tips,/길이가 고르게|실제로 겪은|더해 보세요/);
 assert.match(tips,/앞뒤 문맥/);
 assert.match(flow,/setStat\('gpRepStatRhythm', measured\.lengthCV != null && Number\.isFinite/);
 assert.match(flow,/key === 'uniform'\) return m\.lengthCV != null && Number\.isFinite/);
});

test('report handoff requests source evidence only for an assessed weak axis', () => {
 const text=flow.slice(flow.indexOf('  function repAxisPolicy'),flow.indexOf('  function repRadarAxes'));
 const context=vm.createContext({});vm.runInContext(text,context);
 for(const status of ['off','sparse','on']) for(const content of ['not_assessed','limited','strong','mixed','weak']) {
  assert.equal(context.reportNeedsUserAnchor({measured:{axisPolicy:{axes:{anchor:{status}}}},content:{status:content}}),
   status==='on' && content==='weak');
 }
 assert.equal(context.reportNeedsUserAnchor({content:{status:'weak'}}),false);
 for (const findingStatus of ['not_assessed','not_found','present','deficient']) {
  assert.equal(context.reportNeedsUserAnchor({measured:{axisPolicy:{axes:{anchor:{status:'on'}}}},
   content:{status:'weak',findingStatus}}),findingStatus==='deficient');
 }
 assert.match(flow,/needsUserAnchor: reportNeedsUserAnchor\(reportModel\)/);
});

test('source input review is visible independently of semantic quality and style notices', () => {
 const elements=Object.fromEntries(['lavResultInputNotice','lavResultEffectNotice','lavResultQualityNotice']
  .map(id=>[id,{hidden:true,textContent:''}]));
 const context=vm.createContext({$:id=>elements[id]});
 vm.runInContext(flow.slice(flow.indexOf('  function renderResultNotices'),flow.indexOf('  // ── 완료 화면의 다음 작업 안내')),context);
 context.renderResultNotices({result:{inputStatus:{completeness:'review_required',semantic:'pass'},qualityStatus:'clean',effectStatus:'normal'}});
 assert.equal(elements.lavResultInputNotice.hidden,false);
 assert.match(elements.lavResultInputNotice.textContent,/입력 원문/);
 assert.equal(elements.lavResultQualityNotice.hidden,true);
 assert.equal(elements.lavResultEffectNotice.hidden,true);
 context.renderResultNotices({result:{}});
 assert.equal(elements.lavResultInputNotice.hidden,true);
 assert.equal(elements.lavResultInputNotice.textContent,'');
});

test('input fragment advice remains visible when score copy supplies its own tips', () => {
 const text=flow.slice(flow.indexOf('  function repBuildTips'),flow.indexOf('  // ── 전환 밴드'));
 const message='어미만 남은 문장 조각의 연결을 확인해 주세요.';
 const context=vm.createContext({window:{gpDetectScoreCopy:()=>({nextSteps:['표현을 확인해 주세요.']})}});
 vm.runInContext(text,context);
 const tips=context.repBuildTips({inputReview:{message},interpretation:{}});
 assert.equal(tips[0],message);
 assert.equal(tips.length,2);
});

test('a fragment-only report has input guidance and an optional CTA', () => {
 const elements=Object.fromEntries(['gpRepNext','gpRepCtaTitle','gpRepCtaDesc','gpRepCtaBtn','gpRepCtaHelp','gpRepGoCost']
  .map(id=>[id,{hidden:false,textContent:'',classList:{toggle(){}}}]));
 const context=vm.createContext({$:id=>elements[id],repPaintExpect(){}});
 vm.runInContext(flow.slice(flow.indexOf('  function repPaintCta'),flow.indexOf('  function repPaintExpect')),context);
 context.repPaintCta({conversionAccess:true,conversionRecommend:false,candidateSentences:0,radar:{band:'low'},
  inputReview:{message:'문장 조각을 먼저 확인해 주세요.'}});
 assert.match(elements.gpRepCtaTitle.textContent,/문장 조각/);
 assert.equal(elements.gpRepCtaDesc.textContent,'문장 조각을 먼저 확인해 주세요.');
 assert.doesNotMatch(elements.gpRepCtaTitle.textContent,/후보.*문장, 지금/);
 assert.equal(elements.gpRepCtaBtn.textContent,'다듬기 방법·비용 보기');
});
