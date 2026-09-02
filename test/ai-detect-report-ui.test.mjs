import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function reportSection() {
  const main = await read('pages/main.html');
  const start = main.indexOf('<section class="lav-flow-card gp-rep"');
  const end = main.indexOf('<!-- 진단을 이해한 뒤', start);
  assert.ok(start >= 0 && end > start, '보고서 섹션을 찾음');
  return main.slice(start, end);
}

test('보고서는 히어로(전후·게이지) → 계측 띠 → 근거 → CTA 순서로 읽힌다', async () => {
  const report = await reportSection();
  const hero = report.indexOf('class="gp-rep-hero"');
  const stats = report.indexOf('id="gpRepStats"');
  const grid = report.indexOf('class="gp-rep-grid"');
  const cta = report.indexOf('추천 방법·비용 확인하기');
  assert.ok(hero >= 0 && stats > hero, '계측 띠는 히어로 뒤에 온다');
  assert.ok(grid > stats, '근거 2단은 계측 뒤에 온다');
  const tips = report.indexOf('id="gpRepTipsTitle"');
  assert.ok(tips > grid && cta > tips, '개선 포인트가 근거와 CTA 사이의 다리가 된다');
  assert.match(report, /지금은 차감되지 않아요/u);
  // CTA 제목은 이 글의 실제 후보 수로 말을 건다 — 지어낸 숫자가 아니다.
  assert.match(report, /id="gpRepCtaTitle"/u);
});

test('전후 시연은 한 문장까지만이라고 화면에서 밝힌다', async () => {
  const report = await reportSection();
  // 여러 문장을 고쳐 보여주면 유료 휴머나이징을 무료로 주는 셈이 된다.
  assert.match(report, /예시는 한 문장의 일부까지만 보여드려요/u);
  assert.match(report, /글 전체를 다듬는 건 휴머나이징에서 해요/u);
  assert.equal((report.match(/id="gpRepBefore"/gu) || []).length, 1, '전후 비교는 하나뿐');
  assert.match(report, /휴머나이징 결과 · 사실은 그대로/u);
});

test('보고서는 접근성 기준을 갖춘다', async () => {
  const report = await reportSection();
  assert.match(report, /<h2 class="sr-only" id="gpRepHeading" tabindex="-1">/u);
  assert.equal((report.match(/aria-live=/gu) || []).length, 1, '완료 알림은 하나의 live region만 사용');
  assert.match(report, /id="gpRepParaCells"[^>]*aria-label="[^"]+"/u, '문단 지도에 이름이 있다');
  assert.match(report, /id="gpRepRadarAccessible"/u, '레이더는 보조기술용 텍스트를 함께 둔다');
  assert.match(report, /id="gpRepKeeps"[^>]*aria-label="[^"]+"/u);
  assert.match(report, /id="gpRepMapToggle"[^>]*aria-haspopup="dialog"/u, '전체 문장 버튼은 모달을 연다고 밝힌다');
  assert.match(report, /id="gpRepModal"[\s\S]{0,400}role="dialog" aria-modal="true" aria-labelledby="gpRepModalTitle"/u);
});

test('본문은 핵심 문장만 싣고 전체는 모달로 나간다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  // 문장을 전부 깔면 전달력이 없다 — 다듬을 후보 우선 + 유지할 근거 1개, 최대 4문장.
  assert.match(flow, /var REP_INLINE_KEY = 4;/u);
  assert.match(flow, /function repKeySentences/u);
  assert.match(flow, /picked = unique\.slice\(0, 3\)/u, '신호가 없으면 앞 문장으로 폴백해 빈 패널을 막는다');
  // 장문에는 같은 상투 문구가 여러 문단에 반복된다 — 핵심 4줄이 전부 같은 문장이 되면 안 된다.
  assert.match(flow, /var seen = Object\.create\(null\)/u, '핵심 문장은 원문 기준으로 중복을 걸러낸다');
  assert.match(flow, /window\.gpRepOpenModal = function/u);
  assert.match(flow, /event\.key === 'Escape'/u, 'ESC로 닫힌다');
  assert.match(flow, /repModalOpener[\s\S]{0,400}\.focus\(\)/u, '닫으면 연 버튼으로 포커스가 돌아간다');
  // aria-modal만으로는 Tab이 뒤 화면으로 새 나간다.
  assert.match(flow, /event\.key !== 'Tab'/u, '모달 안에서 초점이 순환한다');
  assert.match(flow, /event\.shiftKey && document\.activeElement === first/u);
  assert.match(flow, /repSentenceRow/u, '인라인과 모달이 같은 행 렌더러를 쓴다');
});

test('보고서 문구는 측정 범위를 넘는 단정을 하지 않는다', async () => {
  const report = await reportSection();
  assert.doesNotMatch(report, /사람이 쓴 글/u);
  assert.doesNotMatch(report, /통과를 보장|안전합니다|걸리지 않/u);
  assert.match(report, /작성 주체나 외부 검사 결과를 확정하지 않아요/u);
});

test('렌더러는 evidence-v2와 구형 응답을 함께 처리하고 판정 맥락을 넘긴다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  assert.match(flow, /var reportView = d\.reportView \|\| \{\}/u);
  assert.match(flow, /if \(score == null\) score = reportNumber\(d\.probability\)/u);
  assert.match(flow, /reportView\.measuredEvidence \|\| d\.measuredEvidence/u);
  assert.match(flow, /source === 'engine' \? 'limited'/u);
  assert.match(flow, /reportContext: true/u);
  assert.match(flow, /reportMeta: 'AI식 문체 신호 '/u);
  assert.match(flow, /repPaintCta\(model\)/u, '전환 밴드는 상태별 분기를 거쳐 그려진다');
});

test('폴백 점수와 보정은 화면에서 밝혀진다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  // 같은 글이 LLM 판정과 엔진 간이 추정 사이에서 크게 달라질 수 있으므로 출처를 숨기지 않는다.
  assert.match(flow, /AI 모델 분석이 완료되지 않아 문체 엔진의 간이 추정으로 계산한 점수예요/u);
  assert.match(flow, /model\.style\.source === 'engine' \? model\.style\.sourceLabel : ''/u, '게이지 옆에 출처가 붙는다');
  // 이력 보정 사실은 화면에 표기하지 않는다(사장님 결정 2026-09-02).
  // 값 자체는 응답·모델에 남아 관리자 원장에서 확인할 수 있다.
  assert.match(flow, /calibrated: styleSignal\.calibrated === true \|\| d\.calibrated === true/u);
  assert.doesNotMatch(flow, /점수를 낮춰 보정했어요|원점수 ' \+ model\.style\.rawScore/u, '보정 문구는 화면에 없다');
});

test('미리보기 실패와 후보 없음을 구분해 말한다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  assert.match(flow, /d\.exampleStatus === 'unavailable'/u);
  assert.match(flow, /예시 문장을 다듬는 중 오류가 생겨/u, '우리 쪽 실패를 사용자 글 탓으로 돌리지 않는다');
  assert.match(flow, /사실을 바꾸지 않고 보여줄 예시 문장을 원문에서 찾지 못했어요/u);
});

test('장문 문단 지도는 실제로 열리는 문단만 칸으로 그린다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  // 3만자를 200행 목록으로 뿌리면 21화면이 된다. 문서 전체가 한 화면에 들어와야 한다.
  assert.match(main, /id="gpRepParaCells"/u);
  assert.match(flow, /function repParaLevel/u, '문단 신호 세기를 셀 색으로 싣는다');
  // 실사고: 문단 수가 문장 예산(200)을 넘는 글에서 269칸 중 153칸이 눌러도 빈 목록이었다.
  //   백엔드가 문단별 전달량(excerpt)을 보내므로 그 값이 있는 문단만 칸으로 만든다.
  assert.match(flow, /row\.excerpt/u, '문단별 전달량을 읽는다');
  assert.match(flow, /if \(n > 0\) openable\.push\(index\)/u, '발췌가 있는 문단만 칸이 된다');
  assert.match(flow, /var useMap = openable\.length > 1/u, '열리는 문단이 하나뿐이면 지도를 쓰지 않는다');
  assert.match(flow, /var usingMap = \(repMapState\.cells \|\| \[\]\)\.length > 1/u,
    '문장 패널·모달·리드가 모두 실제 칸 기준으로 판단한다');
  // 구버전 백엔드(excerpt 없음) 응답에서도 전달된 문장으로 같은 판단을 한다.
  assert.match(flow, /hasExcerptField \? \(Number\(row\.excerpt\) \|\| 0\) : \(shownIn\[index\] \|\| 0\)/u);
  // 기본값은 글 전체의 핵심 문장 — 자동 선택은 장문에서 패널을 1~2줄로 만들었다.
  assert.match(flow, /selected: null,/u, '처음에는 문단을 고르지 않는다');
  assert.ok(!/autoPick/u.test(flow), '자동 선택 잔재가 남아 있지 않다');
  assert.match(flow, /긴 글이라 신호가 뚜렷한 문장과 유지할 문장/u, '서버가 잘라 보낸 사실을 화면이 밝힌다');
  assert.match(flow, /번째 문단/u, '모달은 문단 표지로 전량을 묶는다');
  assert.match(flow, /계측 수치는 문장[\s\S]{0,120}전체 기준이고/u);
  assert.match(flow, /문단 지도에는 발췌가 있는/u, '지도에 띄운 문단 수를 화면이 밝힌다');
});

test('전환 밴드는 추천을 보류할 때도 사라지지 않고 닫는 말을 남긴다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  // 실사고: 간이 추정·근거 부족·이미 유리한 글에서 밴드를 통째로 감춰
  //   보고서가 '개선 포인트' 뒤 허공에서 끝났다. 밀지 않되 닫는 말은 남긴다.
  assert.match(main, /id="gpRepCtaBtn"/u);
  assert.match(main, /id="gpRepCtaDesc"/u);
  assert.match(flow, /function repPaintCta/u);
  assert.match(flow, /band\.hidden = false;/u, '밴드 자체는 항상 남는다');
  assert.match(flow, /band\.classList\.toggle\('is-quiet', !eligible\)/u);
  assert.match(flow, /지금은 추천을 보류했어요/u, '간이 추정이면 유료 수정을 권하지 않는다');
  assert.match(flow, /지금 이 글은 피하기에 유리한 편이에요/u, '깨끗한 글은 그대로 두어도 된다고 말한다');
  assert.match(flow, /판단할 근거가 아직 부족해요/u);
  // 버튼을 감춘 상태에서 비용 줄만 남으면 "어디로 이동한다는 건지" 모순이 된다.
  assert.match(flow, /if \(goBtn && goBtn\.hidden\) return;/u);
  // 흰 마무리 카드에서 강조 글자가 흰색이면 사라진다.
  const css = await read('assets/css/redesign.css');
  assert.match(css, /\.gp-rep-cta\.is-quiet \.gp-rep-cta-help b\{color:var\(--rep-ink\)/u);
  assert.match(css, /\.gp-rep-cta\.is-quiet\{[^}]*background:#fff/u);
});

test('예시를 만들지 못하면 게이지가 가운데로 접힌다', async () => {
  const [flow, css] = await Promise.all([read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  // 좌우 칸이 숨겨져도 3열 격자를 그대로 두면 게이지가 왼쪽 끝에 붙는다.
  assert.match(flow, /classList\.toggle\('is-solo', !usable\)/u);
  assert.match(css, /\.gp-rep-ba\.is-solo\{grid-template-columns:1fr;justify-items:center;\}/u);
});

test('판정은 문단 단위로만 하고, 문장에는 근거 있는 표식만 붙인다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  // 문장별 위험도 3단계 같은 라벨은 근거가 없다. 우리가 실제로 판정한 두 가지만 쓴다.
  assert.match(flow, /candidate \? '다듬을 후보' : '유지할 근거'/u);
  // 종결 어미는 라벨이 아니라 원문 글자를 직접 칠한다 — 목록을 훑으면 반복이 세로로 보인다.
  assert.match(flow, /gp-rep-ending-hl/u);
  assert.match(flow, /raw\.lastIndexOf\(sentence\.ending\)/u);
});

test('원인 레이더는 실측 다섯 축만 그리고 모집단 비교선을 지어내지 않는다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  for (const axis of ['문장 길이 균일', '같은 종결 반복', '일반 표현 비율', '구체 앵커 부족', '화자 입장 부족']) {
    assert.ok(flow.includes(axis), '레이더 축: ' + axis);
  }
  assert.doesNotMatch(main, /일반 패턴/u, '없는 모집단 평균선을 그리지 않는다');
  assert.match(main, /내 글/u, '범례는 내 글 하나뿐');
  assert.match(flow, /repRadarLevel/u, '축마다 낮음·보통·높음을 함께 적는다');
  // 실사고: Number(null) === 0 이라 값이 안 온 축이 조용히 최악(부족 100%)으로 그려졌다.
  //   보고서는 측정된 것만 말한다 — 없는 축은 등급이 아니라 부재로 적는다.
  assert.match(flow, /function repMeasured/u);
  assert.match(flow, /raw == null[\s\S]{0,40}\{ name: name, value: 0, unknown: true \}/u,
    '계측이 없으면 0으로 두고 표시를 바꾼다');
  assert.match(flow, /if \(axis && axis\.unknown\) return '측정 없음'/u);
  assert.ok(!/Number\.isFinite\(anchor\) \? repClamp01\(1 - anchor \/ 0\.3\) : 1/u.test(flow),
    '없는 값을 최고치로 채우던 폴백이 남아 있지 않다');
  // 계측 블록이 통째로 없어도 내용 근거에 같은 수가 있다 — 한 화면이 두 가지로 말하지 않게 한다.
  assert.match(flow, /if \(generic == null\) generic = repMeasured\(model\.content\.generic\)/u);
});

test('개선 포인트는 기준을 넘은 축에서만 만들어진다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  assert.match(flow, /function repBuildTips/u);
  // 3연속은 한국어 격식체에서 흔해 신호로 보지 않는다 — 백엔드 ENDING_RUN_MIN(4)과 같은 문턱.
  assert.match(flow, /Number\(m\.maxEndingRun\) >= 4/u);
  assert.match(flow, /sentence\.endingRun >= 4 && sentence\.ending \? raw\.lastIndexOf/u, '밑줄도 같은 문턱을 쓴다');
  assert.match(flow, /두드러진 문체 신호가 없어요\. 지금 표현을 유지해도 좋아요\./u, '넘은 축이 없으면 유지 안내로 닫는다');
});

test('계측 띠는 실측 네 값만 싣고 지어낸 라벨이 없다', async () => {
  const report = await reportSection();
  for (const label of ['전체 문장 수', '다듬을 후보 문장', '문장 길이 편차', '같은 종결 반복']) {
    assert.ok(report.includes(label), '계측: ' + label);
  }
  assert.doesNotMatch(report, /분석 모델|v\d\.\d/u, '버전 문자열 같은 지어낸 값은 싣지 않는다');
});

test('보고서 UI는 v116 시각 언어와 줄바꿈 규칙을 갖춘다', async () => {
  const css = await read('assets/css/redesign.css');
  assert.match(css, /lavender v116: AI 감지 보고서/u);
  assert.match(css, /--rep-navy:#241c5c/u);
  assert.match(css, /\.gp-rep-dial \.dial-val\{[\s\S]*?stroke:url\(#gpRepDialGrad\)/u);
  assert.match(css, /\.gp-rep-keeps\{[\s\S]*?flex-wrap:wrap/u, '유지될 내용은 칩 단위로 줄이 바뀐다');
  assert.match(css, /\.gp-rep \.gp-rep-hero-title\{[\s\S]*?margin:9px auto 0/u, '제목 가운데 정렬은 공용 h3 규칙을 이겨야 한다');
  assert.match(css, /\.gp-rep-ending-hl\{/u);
  assert.match(css, /\.gp-rep-map-toggle\{[\s\S]*?min-height:44px/u);
  assert.match(css, /\.gp-rep-modal-panel\{[\s\S]*?max-height:min\(82vh/u, '모달 본문은 자체 스크롤로 흐른다');
  assert.match(css, /html\.gp-rep-modal-open\{overflow:hidden;\}/u, '모달이 열리면 뒤 배경은 잠긴다');
  assert.match(css, /cta-runner\.png/u, 'CTA 밴드는 생성한 브랜드 일러스트를 쓴다');
  // v118: 480px에서도 1열로 쌓지 않는다(띠가 한 화면을 먹던 문제) — 2×2 유지
  assert.match(css, /@media \(max-width:480px\)[\s\S]*?\.gp-rep-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)[\s\S]*?transition:none!important/u);
});

test('상한이 걸린 목록은 모달 머리에서 표시 개수를 밝힌다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  // 200개로 잘랐다는 사실은 전량을 보는 자리(모달)에서 말해야 숫자가 어긋나 보이지 않는다.
  assert.match(flow, /개 중 신호 위주 ' \+ shown\.toLocaleString\('ko-KR'\) \+ '개/u);
  assert.match(flow, /다듬을 후보 ' \+ candidates\.toLocaleString/u, '후보·근거 개수도 함께 밝힌다');
});

test('CTA는 실제 후보 수로 말을 걸고 노랑 버튼으로 강조된다', async () => {
  const [flow, css] = await Promise.all([read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.match(flow, /후보 ' \+ model\.content\.generic \+ '문장, 지금 휴머나이징해 볼까요\?/u, '밴드 제목은 우리 기능 이름(휴머나이징)을 쓴다');
  assert.match(flow, /'이 글, 지금 휴머나이징해 볼까요\?'/u, '후보가 없으면 일반 문구로 폴백');
  assert.match(css, /\.gp-rep-cta-btn\{[\s\S]*?background:#f5b425;color:#1a1747/u, '버튼은 로고의 노랑, 잉크 글자(대비 9.1:1)');
});


// ─────────────────────────────────────────────────────────────────────────────
// v117 — 교수님 레이더 · 연동 하이라이트 · 예상 변화 · 공유 카드 · 핸드오프 · 정돈
// ─────────────────────────────────────────────────────────────────────────────
test('게이지는 브랜드 세 구역 색을 두른 반원 "교수님 게이지"로 그려진다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.match(main, /id="gpRepScope"/u);
  assert.ok(!/gpRepDialArc/u.test(main) && !/gpRepDialArc/u.test(flow), '옛 원호 게이지 잔재가 없다');
  assert.match(flow, /function repPaintScope/u);
  // ★ 방향이 곧 뜻: 교수님은 왼쪽 출발선(100), 학생은 오른쪽(0, 안전)으로 달아난다.
  assert.match(flow, /return Math\.max\(0, Math\.min\(100, score\)\) \/ 100 \* Math\.PI/u, '100 → 왼쪽, 0 → 오른쪽');
  assert.match(flow, /\[\[100, 50, 'z-hard'\], \[49, 21, 'z-revise'\], \[20, 0, 'z-low'\]\]/u, '띠는 왼쪽 위험부터 오른쪽 안전까지');
  assert.match(flow, /\/assets\/img\/report\/professor\.png/u, 'ima2 교수님 리소스 — 출발선에 선다');
  assert.match(flow, /report\/runner\.png'[\s\S]{0,160}preserveAspectRatio: 'xMidYMid meet'/u, 'ima2 학생 리소스 — 전신이 원 안에 통째로(바지가 잘리지 않게)');
  assert.match(flow, /transform: 'translate\(' \+ \(pp\[0\] - 26\)/u, '교수님은 100 끝 바깥쪽(왼쪽)');
  assert.match(flow, /var s = 100 - \(100 - p\) \* e;/u, '인트로에서 학생은 교수님 옆에서 출발해 달아난다');
  assert.match(flow, /\[\[82, '위험', 'z-hard'\], \[35, '주의', 'z-revise'\], \[10, '안전', 'z-low'\]\]/u, '구역 말은 위험·주의·안전');
  assert.ok(!/'피하기 어려움', 'z-hard'/u.test(flow), '옛 구역 말이 게이지에 남아 있지 않다');
  // 마커 위치는 속성 그룹, 등장 애니는 안쪽 CSS 그룹 — 같은 요소면 CSS가 translate를 덮는다
  assert.match(flow, /var blipAt = mk\('g', \{ class: 'blip-at', transform: 'translate\(/u);
  assert.match(css, /\.gp-rep-dial \.gp-rep-scope svg\{[^}]*transform:none/u);
  assert.match(flow, /b\.style\.strokeDashoffset = L \* \(1 - frac\)/u, '띠는 구역마다 제 몫만큼 채워진다');
  assert.match(main, /title="멀리 달아났어요">0~20 안전/u, '범례는 한 줄(구간만), 뜻은 title');
  assert.match(flow, /점수가 낮을수록 왼쪽 출발선의 교수님에게서 멀리 달아난 거예요/u, '스크린리더용 설명');
  assert.ok(!/RMIN/u.test(flow), '과녁 기하 잔재가 없다');
});

test('원인 분석은 항목·실측·막대·등급 한 줄의 "신호 강도 바"다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.match(flow, /list\.className = 'gp-rep-signals'/u);
  assert.match(flow, /function repAxisFact/u, '항목마다 실측 한 줄');
  assert.match(flow, /'같은 종결 ' \+ m\.maxEndingRun \+ '문장 연속'/u);
  assert.match(flow, /li\.style\.setProperty\('--v'/u, '막대 길이는 축 값');
  assert.match(css, /\.gp-rep-radar\.is-drawn \.sig-fill\{width:calc\(var\(--v,0\) \* 1%\);\}/u, '막대가 인트로에 차오른다');
  assert.match(css, /\.sig-bar::before\{left:34%;\}/u, '보통·높음 경계선(34·67%)');
  assert.match(main, /막대가 길수록 AI식 신호가 강해요/u);
  assert.ok(!/class: 'glasses'|lens-body/u.test(flow), '렌즈 차트 잔재가 없다');
  assert.ok(!/v118b/u.test(css), '렌즈 CSS 잔재가 없다');
});

test('레이더 축과 계측 숫자는 그 신호를 만든 문장으로 연결된다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  assert.match(flow, /function repLinkAxis/u);
  assert.match(flow, /function repMatchesForAxis/u);
  for (const key of ['generic', 'ending', 'uniform', 'anchor', 'stance']) {
    assert.ok(flow.includes("key === '" + key + "'") || flow.includes("'" + key + "'"), '축 매칭: ' + key);
  }
  assert.match(main, /data-axis="generic" tabindex="0" role="button"/u, '계측 타일도 키보드로 연동');
  assert.match(flow, /li\.addEventListener\('keydown'/u, '신호 항목은 Enter·Space로 고정');
  assert.match(flow, /repMapState\.pinned = \(repMapState\.pinned === key\) \? null : key/u, '탭은 고정 토글');
  // 호버는 표시만 — 문장 패널은 고정(클릭)에서만 바뀐다(스크롤 중 레이아웃 점프 제거)
  assert.match(flow, /if \(!pin\) return;[\s\S]{0,12}repSwapSentences\(\);/u);
  assert.match(flow, /function repSwapSentences/u);
  assert.match(flow, /wrap\.style\.minHeight = before \+ 'px'/u, '교체 중 높이 잠금');
  assert.match(flow, /cell\.classList\.toggle\('is-hit'/u, '문단 지도에 해당 칸이 표시된다');
  assert.match(main, /id="gpRepLinkHead"/u);
  assert.match(main, /항목을 누르면 그 신호를 만든 문장이 왼쪽 핵심 문장 자리에 켜져요/u);
  assert.match(main, /항목을 누르면 위 핵심 문장이 그 신호의 문장으로 바뀌어요/u, '모바일 문구');
  assert.match(flow, /head\.scrollIntoView\(/u, '모바일 고정 시 핵심 문장으로 이동');
});

test('예상 변화는 결정론 두 축만 말하고 문체 점수를 지어내지 않는다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  assert.match(flow, /function repExpectedEffect/u);
  // 결과("38% → 0%")를 약속하지 않고 범위만 센다(마감 리뷰 4번)
  assert.match(flow, /rows\.push\(\{ label: '일반 표현', value: generic \+ '문장/u);
  assert.ok(!/to: '0%'/u.test(flow), '결과를 약속하는 화살표가 없다');
  // 화면 문구에 문체 점수 예측이 없다(주석의 반례 인용은 제외하고 렌더 문자열만 본다)
  assert.ok(!/label: '(문체 점수|AI식 문체 신호)'/u.test(flow), '점수 예측 행이 없다');
  assert.ok(!/textContent = '[^']*예상 점수/u.test(flow), '점수 예측 문구가 없다');
  assert.doesNotMatch(flow, /다듬을 대상 \(원인 축 기준\)/u, '예상 변화 칩 리드는 뺐다 — 밴드는 제목·한 줄·버튼·비용만');
  assert.match(flow, /repPaintExpect\(null\);\s*return;/u, '권하는 상태에서도 칩을 그리지 않는다');
});

test('결과 이미지는 게이지·점수·유지할 근거를 담고 크롬 다운로드로 고화질 저장된다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  assert.match(main, /id="gpRepShare"[^>]*onclick="gpRepShareCard\(\)"/u);
  assert.match(flow, /window\.gpRepShareCard = async function/u);
  // 항상 내려받기(크롬 다운로드) · 2배 해상도 — 공유 시트 경로는 제거(사장님 9/2)
  assert.ok(!/navigator\.canShare/u.test(flow), '공유 시트로 넘기지 않는다');
  assert.match(flow, /cv\.width = W \* SCALE; cv\.height = H \* SCALE;/u);
  assert.match(flow, /a\.download = fileName/u, '내려받기');
  assert.match(flow, /gpkorea\.ai\.kr/u, '카드에 도메인이 남는다');
});

test('보고서에서 넘어간 작업은 원점수·근거 수를 함께 보내고 결과에서 보존을 다시 센다', async () => {
  const flow = await read('assets/js/evasion-flow.js');
  assert.match(flow, /function reportHandoffFields/u);
  // 입력칸의 글이 보고서 때와 다르면 보내지 않는다 — 다른 글의 점수를 상한으로 쓰면 안 된다
  assert.match(flow, /reportText\.replace\(\/\\s\+\/g, ''\) !== String\(text \|\| ''\)\.replace\(\/\\s\+\/g, ''\)\) return \{\}/u);
  assert.match(flow, /out\.sourceProbability = lastReportModel\.score/u);
  assert.match(flow, /out\.sourceEvidence = \{ lived:/u);
  assert.equal((flow.match(/\}, reportHandoffFields\(text\)\)/g) || []).length, 2, '기본·고급 두 요청 경로 모두');
  assert.match(flow, /function renderPreservationBadge/u);
  assert.match(flow, /'유지할 근거 ' \+ \(full \? '보존' : '확인 필요'\)/u);
  assert.match(flow, /renderPreservationBadge\(st\);/u, '완료 렌더에서 호출');
});

test('5문장 미만은 표본 적음을 붙이고 길이 편차 처방을 내지 않는다', async () => {
  const [main, flow] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  assert.match(main, /id="gpRepSample"/u);
  assert.match(flow, /표본이 적어요\. 길이 편차·종결 반복은 참고만 하고/u);
  assert.match(flow, /if \(!smallSample && Number\.isFinite\(Number\(m\.lengthCV\)\)/u);
});

test('보고서의 글자 크기는 8단계 토큰만 쓰고 흐린 회색 리터럴이 없다', async () => {
  const css = await read('assets/css/redesign.css');
  const block = css.slice(css.indexOf('/* ===== lavender v116: AI 감지 보고서'));
  assert.match(block, /--rep-fs-1:11\.5px; --rep-fs-2:12\.5px; --rep-fs-3:13\.5px; --rep-fs-4:15px;/u);
  const literal = block.match(/font-size:\d+(?:\.\d+)?px/g) || [];
  assert.deepEqual(literal, [], '토큰 밖 font-size: ' + literal.slice(0, 5).join(', '));
  assert.ok(!/--rep-fs-\d:(9|9\.5|10|11)px/u.test(block), '11.5px 아래 단계가 없다');
  for (const grey of ['#9a9ab5', '#8b8fa5', '#8b90a3']) {
    assert.ok(!block.includes('color:' + grey) && !block.includes('fill:' + grey), '대비 미달 회색 ' + grey);
  }
  assert.match(block, /--rep-on-navy-muted:#c9c4ea/u);
});


test('v118 — 모바일 최적화와 인터랙션 보강이 한 세트로 들어 있다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  // 모바일: 계측 띠 2×2 유지 · 장문 문단 지도 접기 · 고정 바
  assert.match(css, /@media \(max-width:480px\)\{[^}]*\.gp-rep-stats\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/u, '480px에서도 2×2');
  assert.match(main, /id="gpRepParaMore"/u);
  assert.match(flow, /cells\.scrollHeight > 210/u, '5줄을 넘을 때만 접는다');
  assert.match(main, /id="gpRepSticky"/u);
  assert.match(flow, /function repSetupSticky/u);
  assert.match(flow, /heroOut = !e\.isIntersecting && e\.boundingClientRect\.bottom < 0/u, '히어로를 지나야 나타난다');
  assert.match(flow, /var show = mobile && heroOut && !ctaIn/u, '전환 밴드가 보이면 물러난다');
  assert.match(css, /@media \(min-width:641px\)\{ #mainContent\[data-main-design="lavender"\] \.gp-rep-stickybar\{display:none!important;\} \}/u, '데스크톱엔 없다');
  // 인터랙션: 레이더 펼침·숫자 카운트업·바뀐 부분·툴팁·문장 점프·모달 필터·처방→축
  assert.match(flow, /radar\.classList\.add\('is-drawn'\)/u);
  assert.match(flow, /function repCountUpStats/u);
  // '바뀐 부분 보기'는 After 전체를 드러내므로 게이트와 함께 제거됐다(v120)
  assert.ok(!/function repWordDiff|gpRepToggleDiff/u.test(flow) && !/gpRepBaDiff/u.test(main), '다이프 잔재가 없다');
  assert.match(flow, /function repShowParaTip/u);
  assert.match(css, /@media \(hover:none\)\{ #mainContent\[data-main-design="lavender"\] \.gp-rep-paratip\{display:none;\} \}/u, '터치 기기엔 툴팁을 띄우지 않는다');
  assert.match(flow, /window\.gpRepJumpToSentence = function/u);
  assert.match(flow, /row\.setAttribute\('data-index', String\(sentence\.index\)\)/u);
  assert.match(main, /data-filter="ending"/u);
  assert.match(flow, /function repModalMatches/u);
  assert.match(flow, /b\.className = 'gp-rep-tipbtn'/u, '개선 포인트가 축을 켠다');

});


test('After 문장은 가장 많이 바뀐 자리만 보이고 나머지는 가려져 휴머나이징으로 이어진다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  // 감지만 돌려 짧은 글을 다듬어 가는 구멍을 막는다(사장님 9/2)
  assert.match(flow, /function repPaintAfter/u);
  assert.match(flow, /mask\.className = 'gp-rep-ba-mask'/u, '가려진 조각은 별도 스팬');
  assert.match(flow, /mask\.textContent = p\.text/u, '화면은 서버가 준 가짜 글자만 그린다(원문 나머지는 응답에 없다)');
  assert.match(flow, /vis\.className = 'gp-rep-ba-peek'/u, '공개 조각은 표시된다');
  assert.match(main, /id="gpRepBaUnlock"[^>]*hidden/u);
  assert.match(main, /나머지는 휴머나이징에서 →/u);
  assert.match(flow, /'휴머나이징 미리보기 · 가장 많이 바뀐 자리'/u, 'After 태그는 예시가 아니라 우리 기능을 명시');
  assert.match(css, /\.gp-rep-ba-mask\{[^}]*filter:blur\(5px\)[^}]*user-select:none/u, '블러 + 선택 불가');
  // 개선 포인트도 전환으로 이어진다 — 권하지 않는 상태에서는 숨긴다
  assert.match(main, /id="gpRepTipsCta"[^>]*hidden/u);
  assert.match(flow, /tipsCta\.hidden = model\.conversionEligible === false \|\| actionable === 0/u);
});


test('게이지 라벨은 성기게, 내 글 이름표는 호 안쪽, 새 사실 칩은 감지 화면에서 뺀다', async () => {
  const [flow, css] = await Promise.all([read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.match(flow, /\[\[100, '100'\], \[0, '0'\]\]\.forEach/u, '숫자 눈금은 양 끝만');
  assert.match(flow, /x: \(-Math\.cos\(a\) \* 40\)\.toFixed\(1\)/u, "'내 글'은 호 안쪽(중심 방향)");
  assert.match(css, /\.gp-rep-scope \.who\.me\{[^}]*paint-order:stroke/u, '이름표에 흰 테두리');
  assert.match(flow, /item\.key === 'grounding'\) return;/u, "'원문 밖 새 사실' 칩 제거");
  assert.match(css, /\.gp-rep-tiplist li\{font-size:var\(--rep-fs-4\);line-height:1\.75/u, '개선 포인트 15px');
});


test('Before에 바뀌는 자리를 표시하고 저장 버튼은 히어로 우상단에 있다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.match(flow, /function repPaintBefore/u);
  assert.match(flow, /mark\.className = 'gp-rep-ba-focus'/u);
  assert.match(main, /<section class="gp-rep-hero"[^>]*>\s*<button type="button" class="gp-rep-share" id="gpRepShare"/u, '저장 버튼이 히어로 첫 자식');
  assert.match(css, /\.gp-rep-hero \.gp-rep-share\{position:absolute;top:18px;right:18px/u);
  assert.match(css, /\.gp-rep-zonekey\{flex-wrap:nowrap/u, '범례 한 줄');
});


test('계측 띠는 누를 수 있다는 표시가 있고, 누르면 무엇이 선택됐는지 분명하다', async () => {
  const [main, flow, css] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js'), read('assets/css/redesign.css')]);
  assert.equal((main.match(/class="gp-rep-stat-go"/g) || []).length, 4, '타일 넷 모두 알약');
  assert.match(main, /class="is-link is-all" tabindex="0" role="button" aria-label="전체 문장 보기"/u, '첫 타일은 전체 문장 모달');
  assert.match(flow, /if \(!key\) \{[\s\S]{0,200}window\.gpRepOpenModal\(\)/u);
  assert.match(flow, /go\.textContent = pinnedHere \? '선택됨 ✓' : '문장 보기'/u);
  assert.match(flow, /clear\.className = 'gp-rep-link-clear'/u, '핵심 문장 머리에 해제 버튼');
  assert.match(css, /\.gp-rep-stats>div\.is-link\.is-pinned::after\{[^}]*border-top-color:#f5b425/u, '선택 타일 아래 화살표');
  assert.match(css, /\.gp-rep-stats\.is-nudge \.gp-rep-stat-go\{animation:gpRepNudge/u, '첫 열림 뒤 유도 깜빡임');
  assert.match(css, /\.gp-rep-link-chip\{[^}]*background:#f5b425/u, '같은 노란 칩으로 잇는다');
});
