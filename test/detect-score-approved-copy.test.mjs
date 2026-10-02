import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const read=p=>fs.readFileSync(new URL('../'+p,import.meta.url),'utf8');
const ctx={window:{}};
vm.runInNewContext(read('assets/js/detect-presentation.js'),ctx);
const definition='글에 나타난 AI식 표현과 전개를 종합한 점수예요.';
test('approved definition never gets replaced by located evidence at any score',()=>{
  for(let score=0;score<=100;score++) for(const pattern of [null,{locationCount:2,label:'연결 표현',description:'같은 연결 표현이 반복돼요'}]){
    const info={score,status:'ready',pattern};
    const copy=ctx.window.gpDetectScoreCopy(info);
    assert.equal(copy.description,definition);
    assert.equal(Boolean(copy.evidenceDescription),Boolean(pattern));
    assert.equal((ctx.window.gpDetectInterpretationText(info).match(/글에 나타난 AI식 표현과 전개를 종합한 점수예요\./g)||[]).length,1);
  }
});
test('saved generated attribution prose is neutralized without editing original evidence',()=>{
  const text='표시된 문체 특징이 점수를 높인 근거로 관찰됐어요. 연결 표현이 두 문장에 나타나요.';
  const info={score:72,band:'high',status:'ready'};
  const revised=ctx.window.gpDetectPublicNarrative(text,info);
  assert.match(revised,/원문에서 확인한 문체 특징을 아래에서 살펴보세요/);
  assert.match(revised,/연결 표현이 두 문장에 나타나요/);
  assert.doesNotMatch(revised,/점수를 높인/);
});
test('approved display retains brand geometry and exposes definition immediately after score',()=>{
  const main=read('pages/main.html'),flow=read('assets/js/evasion-flow.js');
  assert.ok(main.indexOf('id="gpRepScore"')<main.indexOf('id="gpRepScoreDefinition"'));
  assert.ok(main.indexOf('id="gpRepScoreDefinition"')<main.indexOf('id="gpRepBandChip"'));
  assert.match(flow,/100점 만점에 ' \+ score \+ '점/);
  assert.match(flow,/ctx.fillText\('글에 나타난 AI식 표현과 전개를 종합한 점수예요\.', 72, 238\)/);
  assert.match(flow,/\/assets\/img\/report\/professor\.png/);
  assert.doesNotMatch(read('pages/landing.html'),/왜 위험|위험 3|주의 2|안전 4/);
  assert.match(read('pages/landing.html'),/<b>78\/100<\/b>/);
  assert.doesNotMatch(read('pages/landing.html'),/<b>78%<\/b>/);
  assert.doesNotMatch(read('pages/detect-report.html'),/점수에 연결된 원인/);
  assert.match(flow,/if \(!items.length\) return;/);
});
