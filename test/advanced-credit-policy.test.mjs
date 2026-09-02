import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

async function loadPricingCalculator() {
  const source = await read('assets/js/humanize-pricing.js');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'humanize-pricing.js' });
  return context.window.gpHumanizePricing;
}

test('공용 고급 계산기는 백엔드와 같은 경계·상한 값을 반환한다', async () => {
  const pricing = await loadPricingCalculator();
  const expected = [
    [3000, 100, 150],
    [3001, 105, 155],
    [3350, 105, 155],
    [3351, 110, 160],
    [3699, 110, 160],
    [3700, 110, 165],
    [10000, 200, 300],
    [10001, 205, 305],
    [20000, 400, 500],
    [20001, 405, 505],
    [30000, 600, 700],
    [50000, 600, 700]
  ];

  assert.equal(Object.isFrozen(pricing), true);
  assert.equal(Object.isFrozen(pricing.policy), true);
  assert.equal(Object.isFrozen(pricing.policy.base), true);
  assert.equal(Object.isFrozen(pricing.policy.evidence), true);
  for (const [length, base, withEvidence] of expected) {
    assert.equal(pricing.advancedBaseCredits(length), base, `${length}자 기본 가격`);
    assert.equal(pricing.advancedCredits(length, false), base, `${length}자 통합 기본 가격`);
    assert.equal(pricing.advancedCredits(length, true), withEvidence, `${length}자 근거 보강 포함 가격`);
  }
  assert.equal(pricing.advancedEvidenceCredits(3699), 50);
  assert.equal(pricing.advancedEvidenceCredits(3700), 55);
});

test('작업 선택·확인·결제 재개와 구형 실행 경로는 공용 계산기만 사용한다', async () => {
  const [boot, appMain, evasion, modals] = await Promise.all([
    read('assets/js/app-boot.js'),
    read('assets/js/app-main.js'),
    read('assets/js/evasion-flow.js'),
    read('partials/modals.html')
  ]);

  assert.ok(
    boot.indexOf("loadScript('/assets/js/humanize-pricing.js')")
      < boot.indexOf("loadScript('/assets/js/app-main.js')"),
    '공용 계산기는 app-main보다 먼저 로드해야 함'
  );
  assert.ok(
    boot.indexOf("loadScript('/assets/js/humanize-pricing.js')")
      < boot.indexOf("loadScript('/assets/js/evasion-flow.js')"),
    '공용 계산기는 작업실 흐름보다 먼저 로드해야 함'
  );
  assert.match(appMain, /window\.gpHumanizePricing\.advancedCredits\(len, false\)/u);
  assert.match(evasion, /function advancedCredit\(len, evidence\)[\s\S]*?window\.gpHumanizePricing\.advancedCredits\(len, evidence\)/u);
  assert.match(evasion, /var gap = advancedCredit\(len, evOn\) - shortHumanizeCredit\(len\)/u);
  assert.match(evasion, /credit = advancedCredit\(len, s\.evidence\) \+ ' 크레딧'/u);
  assert.match(evasion, /resumeMode === 'formal'[\s\S]*?advancedCredit\(resumeText\.length, !!resumeSettings\.evidence\)/u);
  assert.match(evasion, /advancedEvidenceCredits\(len\)/u);
  assert.match(modals, /id="lavEvidenceCredit">입력 길이로 계산</u);
  assert.doesNotMatch(appMain, /len <= 10000 \? 200/u);
  assert.doesNotMatch(evasion, /RESTRUCTURE_TIERS|formalCredit/u);
});

test('요금표·가이드·약관·연구노트·공지의 단계형 정책과 대표값을 고정한다', async () => {
  const [pricing, guide, terms, blog, notice, landing] = await Promise.all([
    read('pages/pricing.html'),
    read('pages/guide.html'),
    read('assets/js/app-main.js'),
    read('scripts/blog-data.mjs'),
    read('assets/js/app-module.js'),
    read('pages/landing.html')
  ]);

  for (const page of [pricing, guide]) {
    assert.match(page, /고급 · 3,000자 이하[\s\S]*?<strong role="cell">100<\/strong>/u);
    assert.match(page, /고급 · 3,001~10,000자[\s\S]*?105~200 · 초과분 350자당 \+5 \(올림\)/u);
    assert.match(page, /고급 · 10,001~30,000자[\s\S]*?205~600 · 초과분 250자당 \+5 \(올림\)/u);
    assert.match(page, /근거 보강 · 3,001~10,000자[\s\S]*?\+50~100 · 초과분 700자가 채워질 때마다 \+5/u);
    assert.match(page, /근거 보강 · 10,001자 이상[\s\S]*?<strong role="cell">\+100<\/strong>/u);
  }
  assert.match(terms, /고급 휴머나이징은 3,000자 이하 100크레딧[\s\S]*?5크레딧 단위 단계형 요금/u);
  assert.match(terms, /근거 보강 추가금은 입력 길이에 따라 50~100크레딧/u);
  assert.match(blog, /slug: 'credit-guide'[\s\S]*?date: '2026-09-02'/u);
  assert.match(blog, /5크레딧 단위 단계형 요금 100~600크레딧/u);

  const representativeValues = [
    ['3,000', '100 / 150'],
    ['3,001', '105 / 155'],
    ['5,000', '130 / 190'],
    ['7,000', '160 / 235'],
    ['10,000', '200 / 300'],
    ['15,000', '300 / 400'],
    ['20,000', '400 / 500'],
    ['30,000', '600 / 700']
  ];
  for (const [length, pair] of representativeValues) {
    assert.ok(blog.includes(`<tr><td>${length}자</td>`) && blog.includes(`>${pair}</td>`), `연구노트 대표값 누락: ${length}자 ${pair}`);
    assert.ok(notice.includes(`• ${length}자: ${pair}크레딧`), `공지 대표값 누락: ${length}자 ${pair}`);
  }

  // 2026-09-03 요금제 개편 공지가 맨 앞에 오므로 고급 단계형 공지는 id로 찾는다.
  const stepsStart = notice.indexOf("id: 'advanced-credit-steps-20260902'");
  assert.ok(stepsStart > 0, '고급 단계형 정책 공지 부재');
  const firstNotice = notice.slice(stepsStart, notice.indexOf('\n },', stepsStart) + 4);
  assert.match(firstNotice, /id: 'advanced-credit-steps-20260902'/u);
  assert.match(firstNotice, /title: '고급 휴머나이징 크레딧 기준을 더 세밀하게 조정했어요'/u);
  assert.doesNotMatch(firstNotice, /pinned: true/u);
  assert.match(firstNotice, /highlightLabel: '업데이트 · 가격 안내'/u);
  assert.match(firstNotice, /date: '2026\.09\.02'/u);
  assert.match(firstNotice, /변경 후 새로 접수되는 작업부터 적용해요/u);
  assert.match(firstNotice, /이미 완료됐거나 진행 중인 작업의 차감액은 소급해 다시 계산하지 않아요/u);
  assert.match(landing, /고급 휴머나이징<small>3,000자 이하 100크레딧 · 정밀 검증<\/small>/u);
});

test('활성 사용자 문구와 SEO 원본에 폐기된 고정 구간 설명이 남지 않는다', async () => {
  const paths = [
    'assets/js/app-main.js',
    'assets/js/evasion-flow.js',
    'pages/pricing.html',
    'pages/guide.html',
    'pages/landing.html',
    'pages/main.html',
    'partials/modals.html',
    'scripts/blog-data.mjs'
  ];
  const sources = await Promise.all(paths.map(read));
  const activeCopy = sources.join('\n');

  assert.doesNotMatch(activeCopy, /길이별 정액|구간별 정액|고급 정액|정액제/u);
  assert.doesNotMatch(activeCopy, /3,001~10,000자[\s\S]{0,120}<strong role="cell">200<\/strong>/u);
  assert.doesNotMatch(activeCopy, /10,001~20,000자[\s\S]{0,120}<strong role="cell">400<\/strong>/u);
  assert.doesNotMatch(activeCopy, /20,001~30,000자[\s\S]{0,120}<strong role="cell">600<\/strong>/u);
  assert.doesNotMatch(activeCopy, /근거 보강[^\n]{0,80}3,001자 이상[^\n]{0,120}\+100/u);
});
