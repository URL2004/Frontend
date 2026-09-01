import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('신규 계정 무료 지급량은 25크레딧으로 일관되고 체험 세그먼트도 같은 기준을 쓴다', async () => {
  const [main, landing, login, guide, faq, flow, evasion, module_, terms] = await Promise.all([
    read('pages/main.html'),
    read('pages/landing.html'),
    read('partials/login-screen.html'),
    read('pages/guide.html'),
    read('pages/faq.html'),
    read('assets/js/conversion-flow.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js'),
    read('assets/js/app-main.js')
  ]);
  const publicClaims = [main, landing, login, guide, faq, module_, terms].join('\n');
  assert.match(publicClaims, /가입 시 25크레딧|회원가입하면 25크레딧/u);
  assert.doesNotMatch(publicClaims, /(?:가입|회원가입|신규 가입)[^\n]{0,30}10크레딧|무료 10크레딧/u);
  assert.match(flow, /var SIGNUP_GRANT_CREDITS = 25/u);
  assert.match(flow, /balance === SIGNUP_GRANT_CREDITS/u);
  assert.match(flow, /balance < SIGNUP_GRANT_CREDITS/u);
  assert.match(evasion, /var SIGNUP_GRANT_CREDITS = 25/u);
  assert.match(module_, /loggedIn \? balance : 25/u);
});

test('고급 휴머나이징 화면 계산은 3,000자 구간과 근거 보강 차등 가격을 고정한다', async () => {
  const [evasion, pricing, guide] = await Promise.all([
    read('assets/js/evasion-flow.js'),
    read('pages/pricing.html'),
    read('pages/guide.html')
  ]);
  for (const tier of [
    /maxLength: 3000, baseCredits: 100, evidenceCredits: 50/u,
    /maxLength: 10000, baseCredits: 200, evidenceCredits: 100/u,
    /maxLength: 20000, baseCredits: 400, evidenceCredits: 100/u,
    /maxLength: Infinity, baseCredits: 600, evidenceCredits: 100/u
  ]) assert.match(evasion, tier);
  assert.match(evasion, /ADVANCED_RECOMMEND_MIN_CHARS = 3000/u);
  for (const page of [pricing, guide]) {
    assert.match(page, /고급 · 3,000자 이하[\s\S]*?<strong role="cell">100<\/strong>/u);
    assert.match(page, /근거 보강 · 3,000자 이하[\s\S]*?<strong role="cell">\+50<\/strong>/u);
    assert.match(page, /근거 보강 · 3,001자 이상[\s\S]*?<strong role="cell">\+100<\/strong>/u);
  }
});

test('정밀 감지 실패는 다른 점수를 표시하지 않고 무차감 재시도 상태를 제공한다', async () => {
  const [main, evasion, css] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/evasion-flow.js'),
    read('assets/css/redesign.css')
  ]);
  assert.match(main, /data-flow="detectError"[^>]+role="status"[^>]+aria-live="polite"/u);
  assert.match(main, /다른 산식의 추정치로 대신 보여주지 않았고, 크레딧도 사용하지 않았습니다/u);
  assert.match(main, /id="lavDetectRetry"[^>]+onclick="lavRetryDetect\(\)"/u);
  assert.match(evasion, /res\.status === 503 && d && d\.code === 'DETECT_MODEL_UNAVAILABLE'/u);
  assert.match(evasion, /detect_measurement_unavailable/u);
  assert.match(evasion, /detectPending/u);
  assert.match(evasion, /var pendingDetectRequest = null/u);
  assert.match(evasion, /var DETECT_REQUEST_ID_RE = \/\^\[A-Za-z0-9\]\[A-Za-z0-9:_-\]\{7,79\}\$\//u);
  assert.match(evasion, /function normalizeDetectRequestId\(value\)/u);
  assert.match(evasion, /function detectRequestIdFor\(text, requestIdOverride\)/u);
  assert.match(evasion, /pendingDetectRequest = \{ text: text, requestId: override \}/u);
  assert.match(evasion, /pendingDetectRequest\.text === text/u);
  assert.match(evasion, /var reqId = detectRequestIdFor\(text, options\.requestId\)/u);
  assert.match(evasion, /var authoritativeRemaining = Number\(d\.remainingCredits\)/u);
  assert.match(evasion, /!unlimited && Number\.isFinite\(authoritativeRemaining\)/u);
  const insufficientBranch = evasion.match(/if \(res\.status === 402[\s\S]+?if \(res\.status === 401/u)?.[0] || '';
  assert.match(insufficientBranch, /gpOpenCreditCheckout/u);
  assert.match(insufficientBranch, /payload:\s*\{ text: text, requestId: reqId \}/u);
  assert.doesNotMatch(insufficientBranch, /clearPendingDetectRequest/u);
  const resumeBranch = evasion.match(/window\.gpResumeEvasionDetect = function \(payload\)[\s\S]+?return true;\s*\n\s*\};/u)?.[0] || '';
  assert.match(resumeBranch, /typeof payload\.text === 'string'/u);
  assert.match(resumeBranch, /normalizeDetectRequestId\(payload\.requestId\)/u);
  assert.match(resumeBranch, /if \(hasRequestId && !resumeRequestId\) return false/u);
  assert.match(resumeBranch, /lavDetect\(\{ resumeAfterPayment: true, requestId: resumeRequestId \|\| undefined \}\)/u);
  assert.match(evasion, /renderReport\(d\)[\s\S]+lavInitCollapse\('lavRepParaList', 'lavRepParaToggle'\);[\s\S]+clearPendingDetectRequest\(reqId\)/u);
  assert.match(evasion, /catch \(e\) \{[\s\S]+네트워크 상태를 확인해 주세요/u);
  assert.doesNotMatch(evasion, /catch \(e\) \{[\s\S]{0,300}clearPendingDetectRequest/u);
  assert.match(evasion, /'X-Request-Id': reqId/u);
  assert.doesNotMatch(evasion, /서버가 LLM 실패 시에도 엔진 추정 숫자를 보내므로/u);
  assert.match(css, /\.lav-detect-error-actions \.lav-flow-cta:disabled/u);
});
