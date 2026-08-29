import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('AI 감지 실행 확인은 분석 내용·비용·잔액·무차감 조건을 분리해 안내한다', async () => {
  const [source, account] = await Promise.all([
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js')
  ]);

  assert.match(source, /variant:\s*'detect'/u);
  assert.match(source, /title:\s*'AI 감지를 시작할까요\?'/u);
  assert.match(source, /글 전체의 AI 티 지수와 두드러진 문체 신호를 확인합니다/u);
  assert.match(source, /label:\s*'분석할 글'/u);
  assert.match(source, /label:\s*'사용 크레딧'/u);
  assert.match(source, /label:\s*'감지 후 잔액'/u);
  assert.match(source, /감지에 실패하면 크레딧은 차감되지 않아요/u);
  assert.match(source, /실제 작성 주체나 외부 검사 결과를 보장하지 않습니다/u);
  assert.match(source, /window\.UP === 'unlimited'/u);
  assert.match(source, /무제한 이용권으로 처리되며 크레딧은 차감되지 않아요/u);
  assert.match(source, /'감지 시작 · ' \+ cost\.toLocaleString\(\) \+ '크레딧'/u);
  assert.doesNotMatch(source, /크레딧 사용하고 감지/u);
  assert.match(source, /source:\s*'evasion_detect_preflight'/u);
  assert.match(source, /await window\.authReady/u);
  assert.match(source, /window\.gpUserDataReady === true/u);
  assert.match(account, /window\.gpUserDataReady = true/u);
  assert.doesNotMatch(source, /이 글\([^\n]+100자당 1크레딧/u);
});

test('공통 확인창은 감지 전용 정보 구조와 키보드 포커스 복귀를 제공한다', async () => {
  const [feedback, styles] = await Promise.all([
    read('assets/js/ui-feedback.js'),
    read('assets/css/redesign.css')
  ]);

  assert.match(feedback, /aria-describedby="gpDialogBody"/u);
  assert.match(feedback, /id="gpDialogSummary"/u);
  assert.match(feedback, /id="gpDialogSafe"/u);
  assert.match(feedback, /id="gpDialogNote"/u);
  assert.match(feedback, /function trapDialogFocus/u);
  assert.match(feedback, /previousFocus\.isConnected/u);
  assert.match(feedback, /document\.documentElement\.classList\.add\('gp-dialog-open'\)/u);
  assert.match(feedback, /classList\.add\('gp-dialog-open'\)/u);
  assert.match(feedback, /classList\.toggle\('variant-detect'/u);
  assert.match(feedback, /<svg viewBox="0 0 24 24" aria-hidden="true">/u);
  assert.doesNotMatch(feedback, /class="gp-dialog-x"[^>]*>×/u);
  assert.match(styles, /\.gp-dialog-root\.variant-detect \.gp-dialog-card\{width:min\(456px,100%\)/u);
  assert.match(styles, /body\.gp-dialog-open\{overflow:hidden;/u);
  assert.match(styles, /grid-template-columns:96px minmax\(0,1fr\)/u);
  assert.match(styles, /@media\(max-width:480px\)/u);
});

test('메인 파셜의 숨은 줄과 빈 탭 슬롯은 제거되어 사이드바 상단과 문서 높이를 밀지 않는다', async () => {
  const [main, loader, build, designs] = await Promise.all([
    readFile(new URL('../pages/main.html', import.meta.url)),
    read('assets/js/page-loader.js'),
    read('scripts/build-vite-static.mjs'),
    read('assets/js/main-designs.js')
  ]);

  assert.notDeepEqual([...main.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.ok(loader.includes("replace(/^\\uFEFF/u, '')"));
  assert.ok(build.includes("content.replace(/^\\uFEFF/u, '')"));
  assert.match(designs, /tabs\.hidden = lavTab === 'main'/u);
});

test('라벤더 메뉴는 작업 기록과 겹치는 보관함 진입점을 노출하지 않는다', async () => {
  const main = await read('pages/main.html');
  const menu = main.match(/<nav class="gp-lav-menu"[\s\S]*?<\/nav>/u)?.[0] || '';

  assert.match(menu, />작업 기록</u);
  assert.doesNotMatch(menu, /lavOpenLibrary|>보관함</u);
});
