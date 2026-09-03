import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (rel) => fs.readFile(path.join(root, rel), 'utf8');

test('페이지·컴포저·감지 결과의 모드 전환은 공통 출발 맥락을 기록한다', async () => {
  const [appMain, evasion, appModule, main] = await Promise.all([
    read('assets/js/app-main.js'),
    read('assets/js/evasion-flow.js'),
    read('assets/js/app-module.js'),
    read('pages/main.html')
  ]);

  assert.match(appMain, /gpTrack\('product_mode_open', \{[\s\S]*?source_route:[\s\S]*?source_surface:[\s\S]*?source_mode:[\s\S]*?target_mode:/u);
  assert.match(appMain, /window\.gpSelectProductMode = function/u);
  assert.match(appMain, /const sourceRoute = getRouteTab\(\);[\s\S]*?trackProductModeOpen\(productMode, sourceRoute/u);
  assert.match(main, /gpSelectProductMode\('detect', 'composer_toggle'\)/u);
  assert.match(main, /gpSelectProductMode\('humanize', 'composer_toggle'\)/u);
  assert.match(evasion, /gpTrackProductModeOpen\('humanize', 'main', 'detect_report_cta', 'detect'\)/u);
  assert.match(appModule, /gpTrackProductModeOpen\('humanize', 'history', 'history_detail', 'detect'\)/u);
});

test('공개 안내 페이지 CTA는 위치와 목표 모드를 구분한다', async () => {
  const pages = await Promise.all(['blog', 'detect-report', 'faq', 'guide', 'qna'].map((name) => read(`pages/${name}.html`)));
  const joined = pages.join('\n');
  for (const surface of ['blog_hero', 'detect_report_hero', 'detect_report_body', 'faq_next', 'guide_hero', 'guide_footer', 'qna_support_task']) {
    assert.match(joined, new RegExp(`openProductMode\\('[^']+', '${surface}'\\)`, 'u'), `${surface} 출발 위치가 빠지면 안 된다`);
  }
});

test('AI 감지 진입 즉시 히어로·신뢰 문구·단가·버튼 이름이 감지 맥락으로 바뀐다', async () => {
  const [main, evasion] = await Promise.all([read('pages/main.html'), read('assets/js/evasion-flow.js')]);
  assert.match(main, /id="lavHeroSubtitle"/u);
  assert.match(main, /id="lavTrustNote"/u);
  assert.match(evasion, /AI식 문체 신호를 문단별로 확인하고, 필요한 부분은 바로 휴머나이징으로 이어가세요\./u);
  assert.match(evasion, /AI 감지 최소 100자 · 100자당 1크레딧/u);
  assert.match(evasion, /m === 'detect' \? 'AI 감지' : '휴머나이징'/u);
});
