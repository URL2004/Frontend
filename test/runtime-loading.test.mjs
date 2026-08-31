import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

function read(path) {
  return fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

const boot = read('assets/js/app-boot.js');
const loader = read('assets/js/page-loader.js');
const landingJs = read('assets/js/landing.js');
const landingCss = read('assets/css/landing.css');

test('런타임 자산은 무한 대기하지 않고 실패 시 재시도 가능한 화면을 제공한다', () => {
  assert.match(boot, /DEFAULT_ASSET_TIMEOUT_MS = 12000/u);
  assert.match(boot, /Timed out loading ' \+ src/u);
  assert.match(boot, /Timed out loading ' \+ href/u);
  assert.match(boot, /data-gp-boot-retry/u);
  assert.match(boot, /window\.location\.reload\(\)/u);
  assert.match(loader, /controller\.abort\(\)[\s\S]{0,80}?8000/u);
  assert.match(loader, /Timed out loading page partial/u);
});

test('외부 폰트는 시스템 폴백을 막지 않고 핵심 스크립트는 병렬 다운로드·안정 순서를 쓴다', () => {
  assert.match(boot, /function loadOptionalStyle\(href, id\)/u);
  assert.match(boot, /loadOptionalStyle\('https:\/\/cdn\.jsdelivr\.net\/gh\/orioncactus\/pretendard/u);
  assert.match(boot, /loadOptionalStyle\('https:\/\/fonts\.googleapis\.com/u);
  assert.match(boot, /function ensurePreconnect\(origin\)/u);
  for (const origin of ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'www.gstatic.com', 'url88-d1d27.firebaseapp.com']) {
    assert.match(boot, new RegExp(origin.replaceAll('.', '\\.'), 'u'));
  }
  assert.doesNotMatch(boot, /await loadStyle\('https:\/\/(?:cdn\.jsdelivr\.net|fonts\.googleapis\.com)/u);
  assert.match(boot, /script\.async = options\.async === true/u);
  assert.ok((boot.match(/await Promise\.all\(\[/gu) || []).length >= 4);
  assert.ok(boot.indexOf("loadScript('/assets/js/session-security.js')") < boot.indexOf("loadScript('/assets/js/conversion-flow.js')"));
  assert.ok(boot.indexOf("loadScript('/assets/js/app-main.js')") < boot.indexOf("loadScript('/assets/js/main-designs.js')"));
});

test('첫 경로만 우선 조립하고 관리자·실험 화면은 권한 경로에서 지연 로드한다', () => {
  assert.match(loader, /var ROUTE_PARTIALS = \{/u);
  assert.match(loader, /var STANDARD_ROUTES = \[[\s\S]*?'mypage'[\s\S]*?\];/u);
  assert.match(loader, /var PRIVILEGED_ROUTES = \['admin', 'adminHumanizeLab', 'writingLab'\]/u);
  const standard = loader.slice(loader.indexOf('var STANDARD_ROUTES'), loader.indexOf('var PRIVILEGED_ROUTES'));
  assert.doesNotMatch(standard, /admin|writingLab/u);
  assert.match(loader, /var routeList = initialRoute === 'main' \? \['main'\] : \['main', initialRoute\]/u);
  assert.match(loader, /function ensureRoute\(route\)/u);
  assert.match(loader, /loadDeferredAppPartials/u);
  assert.match(boot, /installLazyRouteGuards\(\)/u);
  assert.match(boot, /GPPageLoader\.ensureRoute\('writingLab'\)/u);
  assert.match(loader, /fetchText\('\/partials\/app-bundle\.html'\)/u, '이전 단일 번들 롤백 호환은 유지');
});

test('랜딩 데모는 레이아웃 폭 대신 transform을 움직이고 화면 밖에서 완전히 멈춘다', () => {
  assert.match(landingCss, /@keyframes lpdRun\{from\{transform:scaleX\(\.2\)\}to\{transform:scaleX\(\.85\)\}\}/u);
  assert.doesNotMatch(landingCss, /@keyframes lpdRun\{[^}]*width/u);
  assert.match(landingCss, /animation-play-state:paused/u);
  assert.match(landingJs, /var demoInView = false/u);
  assert.match(landingJs, /box\.classList\.toggle\('is-demo-paused', !demoInView\)/u);
  assert.match(landingJs, /if \(document\.hidden \|\| !demoInView\) return/u);
  assert.match(landingJs, /else if \(demoInView && demoEl\('lpDemo'\)/u);
});

test('랜딩 서비스 탭은 roving tabindex와 방향키 이동을 제공한다', () => {
  assert.match(landingJs, /btn\.tabIndex = on \? 0 : -1/u);
  assert.match(landingJs, /event\.key === 'ArrowRight'/u);
  assert.match(landingJs, /event\.key === 'ArrowLeft'/u);
  assert.match(landingJs, /event\.key === 'Home'/u);
  assert.match(landingJs, /event\.key === 'End'/u);
  assert.match(landingJs, /window\.gpLandingBlendPick\(Number\(nextTab\.dataset\.blend\)\);[\s\S]{0,80}?nextTab\.focus\(\)/u);
  const pick = landingJs.slice(landingJs.indexOf('window.gpLandingBlendPick'), landingJs.indexOf('function initLandingBlendTabs'));
  assert.doesNotMatch(pick, /\.focus\(/u, '마우스 선택은 포커스를 강제로 옮기지 않음');
});
