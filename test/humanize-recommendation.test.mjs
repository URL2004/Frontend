import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../assets/js/evasion-flow.js', import.meta.url), 'utf8');
function load(diag, length=499, touched=false) {
  const elements = {};
  const element = id => elements[id] ||= {hidden:true, checked:false, classList:{toggle(name,on){this[name]=on;}}};
  element('lavInput').value = 'a'.repeat(length);
  const events=[];
  const context={lastDiag:diag,toneSelectionTouched:touched,MODE_RECOMMENDATION_ENABLED:true,$:element,document:{querySelector:q=>element(q.includes('formal')?'formalRadio':'blogRadio')},window:{gpTrack:(name,data)=>events.push({name,data})}};
  for(const name of ['advancedUnavailable','recommendedMode','isRecommendedMode','applyAdvancedRouting','trackDiagnosisView','trackModeSelection']) {
    const start=source.indexOf('  function '+name+'(');
    const end=source.indexOf('\n  }',start)+4;
    vm.runInNewContext(source.slice(start,end),context);
  }
  context.applyAdvancedRouting();context.trackDiagnosisView(diag);
  return {context,elements,events};
}
test('server advanced recommendation survives the old length boundary in both entry paths',()=>{
  for(const diagnosisSource of ['backend','paid_report']) for(const length of [499,1497,2994,2999,3000,4000]) {
    const {elements,context,events}=load({recommendedMode:'formal',advancedEligible:true,diagnosisSource},length);
    assert.equal(elements.lavFormalRecommended.hidden,false);
    assert.equal(elements.lavBasicRecommended.hidden,true);
    assert.equal(elements.formalRadio.checked,true);
    context.trackModeSelection('formal');
    assert.equal(events[0].data.recommendation_exposed,true);
    assert.equal(events[1].data.is_recommended,true);
  }
});
test('explicit basic recommendation remains basic',()=>{
  const {elements}=load({recommendedMode:'blog'});
  assert.equal(elements.lavBasicRecommended.hidden,false);
  assert.equal(elements.lavFormalRecommended.hidden,true);
});

test('recommendation reason and policy analytics agree for both diagnosis entry paths',()=>{
  for(const diagnosisSource of ['backend','paid_report']) {
    const diag={recommendedMode:'formal',advancedEligible:true,diagnosisSource,
      recommendationVersion:'humanize-recommendation-v2',recommendationCode:'long_explainer_rewrite',
      recommendationReason:'설명이 길고 다시 쓸 대상 문장이 여러 곳에 있어요.',recommendationSignals:{additionalCredits:30}};
    const {elements,events,context}=load(diag,3000);
    assert.equal(elements.lavRecommendationReason.hidden,false);
    assert.equal(elements.lavRecommendationReason.textContent,'고급 추천 · '+diag.recommendationReason);
    context.trackModeSelection('blog');
    for(const event of events) {
      assert.equal(event.data.recommended_mode,'formal');
      assert.equal(event.data.recommendation_code,diag.recommendationCode);
      assert.equal(event.data.recommendation_version,diag.recommendationVersion);
      assert.equal(event.data.additional_credits,30);
    }
    assert.equal(events[1].data.is_recommended,false);
  }
});

test('uncertain profiles explain the choice without a badge and stale reasons clear on fallback',()=>{
  const {elements,context,events}=load({recommendedMode:null,recommendationCode:'uncertain_document_profile',recommendationReason:'글의 성격을 확실히 판단하기 어려워요.'});
  assert.equal(elements.lavBasicRecommended.hidden,true);
  assert.equal(elements.lavFormalRecommended.hidden,true);
  assert.match(elements.lavRecommendationReason.textContent,/^선택 안내/);
  assert.equal(events[0].data.recommended_mode,'none');
  context.lastDiag={diagnosisSource:'fallback',recommendationReason:'stale'};
  context.applyAdvancedRouting();
  assert.equal(elements.lavRecommendationReason.hidden,true);
  assert.equal(elements.lavRecommendationReason.textContent,'');
});
test('failed, absent, unknown, and unavailable recommendations show no badge or recommendation analytics',()=>{
  for(const diag of [null,{}, {recommendedMode:'unknown'}, {recommendedMode:'blog',diagnosisUnavailable:true}, {recommendedMode:'blog',diagnosisSource:'fallback'}, {recommendedMode:'formal',advancedEligible:false}]) {
    const {elements,events,context}=load(diag);
    assert.equal(elements.lavBasicRecommended.hidden,true);
    assert.equal(elements.lavFormalRecommended.hidden,true);
    assert.equal(elements.lavCardBasic.classList['is-recommended'],false);
    assert.equal(elements.lavCardFormal.classList['is-recommended'],false);
    assert.equal(events[0].data.recommendation_exposed,false);
    context.trackModeSelection('blog');assert.equal(events[1].data.is_recommended,false);
  }
});
test('advanced eligibility lock and a user-selected basic mode are preserved',()=>{
  const locked=load({recommendedMode:'formal',advancedEligible:false});
  assert.equal(locked.elements.formalRadio.disabled,true);
  const {context,elements}=load({recommendedMode:'formal'},499,true);
  elements.blogRadio.checked=true;elements.formalRadio.checked=false;
  context.applyAdvancedRouting();
  assert.equal(elements.blogRadio.checked,true);assert.equal(elements.formalRadio.checked,false);
});
