import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('컴포저는 붙여넣는 즉시 이 글의 크레딧과 잔액을 같은 단가로 계산해 보여준다', async () => {
  const [main, evasion, designs] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/main-designs.js')
  ]);
  assert.match(main, /id="lavEstimate"/u);
  assert.match(main, /id="lavEstimateCost"/u);
  assert.match(main, /id="lavEstimateBalance"/u);
  assert.match(main, /onclick="lavEstimateAction\(\)"/u);
  // 단가는 실행 경로와 같은 함수를 쓴다 — 표시값과 청구값이 갈라지지 않게.
  assert.match(evasion, /detect \? detectCredit\(text\.length\) : shortHumanizeCredit\(text\.length\)/u);
  assert.match(evasion, /Math\.ceil\(\(Number\(len\) \|\| 0\) \/ 100\)/u);
  // 입력·모드 전환 양쪽에서 갱신된다.
  assert.match(designs, /window\.lavUpdateEstimate\(\)/u);
  assert.match(evasion, /window\.lavSetMode = function[\s\S]*?window\.lavUpdateEstimate\(\)/u);
});

test('잔액이 모자라면 작업 보존형 결제창으로 넘기고 결제 후 초안을 되살린다', async () => {
  const [evasion, flow] = await Promise.all([
    read('assets/js/evasion-flow.js'),
    read('assets/js/conversion-flow.js')
  ]);
  assert.match(evasion, /크레딧 부족 · 충전하기/u);
  assert.match(evasion, /gpOpenCreditCheckout\(\{[\s\S]*?action: 'composer_draft'/u);
  assert.match(evasion, /window\.gpResumeComposerDraft/u);
  assert.match(flow, /composer_draft: 'gpResumeComposerDraft'/u);
  // 아직 시작하지 않은 초안이므로 결제 후 작업을 자동 실행하지 않는다.
  assert.match(evasion, /window\.gpResumeComposerDraft = function[\s\S]*?lavUpdateEstimate\(\)/u);
  assert.doesNotMatch(evasion, /window\.gpResumeComposerDraft = function[\s\S]*?lavRun\(\)/u);
});

test('비로그인 사용자에게는 예상 비용 대신 무료 크레딧 가입을 안내한다', async () => {
  const evasion = await read('assets/js/evasion-flow.js');
  assert.match(evasion, /로그인하고 무료 10크레딧 받기/u);
  assert.match(evasion, /source: 'composer_estimate'/u);
});

test('첫 화면 오퍼는 결제 이력과 잔액 단계에 따라 문구와 다음 행동이 달라진다', async () => {
  const [main, flow, module_] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/conversion-flow.js'),
    read('assets/js/app-module.js')
  ]);
  assert.match(main, /id="lavHeroOffer"/u);
  assert.match(main, /onclick="gpHeroOfferAction\(\)"/u);
  for (const segment of ['trial_unused', 'trial_engaged', 'returning_low_balance', 'returning_funded']) {
    assert.match(flow, new RegExp(`segment === '${segment}'`, 'u'));
  }
  assert.match(flow, /loggedOutHeroCopy/u);
  assert.match(flow, /window\.gpRefreshHeroOffer/u);
  // 재구매 세그먼트는 지난번 상품으로 바로 결제한다.
  assert.match(flow, /offerVariant: 'repurchase_previous'[\s\S]*?source: 'hero_offer'/u);
  // 잔액이 바뀌면 오퍼도 다시 계산한다.
  assert.match(module_, /window\.gpRefreshHeroOffer\(true\)/u);
});

test('비로그인 홈 방문은 새 랜딩으로 가되 광고 딥링크와 로그인 사용자는 앱으로 보낸다', async () => {
  const [landingJs, appMain, loader, boot, index] = await Promise.all([
    read('assets/js/landing.js'),
    read('assets/js/app-main.js'),
    read('assets/js/page-loader.js'),
    read('assets/js/app-boot.js'),
    read('index.html')
  ]);
  assert.match(loader, /'\/pages\/landing\.html'/u);
  assert.match(boot, /landing\.js/u);
  assert.match(index, /landing\.css/u);
  assert.match(appMain, /window\.gpMaybeShowLanding\(\)/u);
  // 광고 딥링크(?mode=)는 기존 의도대로 컴포저 직행.
  assert.match(landingJs, /hasAdLandingMode/u);
  assert.match(landingJs, /if \(hasAdLandingMode\(\)\) return false/u);
  // 로그인 사용자에게 랜딩이 스쳐 지나가지 않도록 authReady 확정 후 판단한다.
  assert.match(landingJs, /window\.authReady[\s\S]*?then\(applyLanding/u);
  assert.match(landingJs, /if \(window\.CU\) return false/u);
});

test('랜딩은 현재 서비스 네 가지와 단가를 사실대로 안내하고 통과를 약속하지 않는다', async () => {
  const landing = await read('pages/landing.html');
  for (const name of ['AI 감지', '기본 휴머나이징', '고급 휴머나이징', '글쓰기 랩']) {
    assert.ok(landing.includes(name), `랜딩에 ${name} 안내가 있어야 한다`);
  }
  assert.match(landing, /100자당 1크레딧/u);
  assert.match(landing, /100자당 2크레딧/u);
  assert.match(landing, /1만자 이하 200크레딧/u);
  assert.match(landing, /800자 이하 40크레딧/u);
  // 과장 금지: 외부 검사 통과나 점수를 보장하지 않는다고 명시한다.
  assert.match(landing, /보장하지 않습니다/u);
  assert.match(landing, /유효기간 없이/u);
  // 구형 시안 마크업을 되살리지 않는다(주석 언급은 허용, 실제 클래스 사용은 금지).
  assert.doesNotMatch(landing, /class="[^"]*gp-main-stage/u);
  assert.doesNotMatch(landing, /class="[^"]*gp-paper-/u);
});

test('홈 프리렌더 본문은 작업 화면이 아니라 랜딩을 크롤러에 노출한다', async () => {
  const seo = await read('scripts/seo-prerender.mjs');
  assert.match(seo, /out: 'index\.html',\s*\n\s*url: '\/',\s*\n\s*partial: 'landing\.html'/u);
  // 랜딩이 자체 h1을 가지므로 홈에 h1을 덧붙이지 않는다.
  assert.doesNotMatch(seo, /route\.url === '\/' \|\| !/u);
});
