import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('주요 입력은 placeholder가 아니라 연결된 label로 접근 가능한 이름을 가진다', async () => {
  const [main, notice, writing] = await Promise.all([
    read('pages/main.html'),
    read('pages/notice.html'),
    read('pages/writing-lab.html')
  ]);
  assert.match(main, /<label class="sr-only" for="lavInput">[^<]+<\/label>/u);
  assert.match(main, /<label class="sr-only" for="lavBlockedMemo">[^<]+<\/label>/u);
  assert.match(notice, /for="ntitle"/u);
  assert.match(notice, /for="nbody_input"/u);
  assert.match(writing, /for="wlFinal"/u);
  assert.match(writing, /for="wlDraft"/u);
});

test('SPA는 main landmark 하나를 유지하고 각 경로 제목으로 포커스를 옮긴다', async () => {
  const [shell, guide, writing, admin, appMain, designs, prune] = await Promise.all([
    read('partials/app-shell-start.html'),
    read('pages/guide.html'),
    read('pages/writing-lab.html'),
    read('pages/admin.html'),
    read('assets/js/app-main.js'),
    read('assets/js/main-designs.js'),
    read('scripts/prune-legacy-ui.mjs')
  ]);
  assert.match(shell, /<main[^>]+id="gpRouteContent"[^>]+tabindex="-1"/u);
  assert.doesNotMatch(guide, /<\/?main\b/u);
  assert.doesNotMatch(writing, /<\/?main\b/u);
  assert.match(admin, /<h1>운영 관리<\/h1>/u);
  assert.match(appMain, /function updateRouteAccessibility/u);
  assert.match(appMain, /setAttribute\('aria-current', 'page'\)/u);
  assert.match(appMain, /target\.focus\(\{ preventScroll: true \}\)/u);
  assert.match(designs, /b\.setAttribute\('aria-current', 'page'\)/u);
  assert.match(prune, /id="gpRouteContent" tabindex="-1"/u);
});

test('글자 수는 매 입력을 읽지 않고 제한선 교차만 보조기기에 알린다', async () => {
  const [main, designs] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/main-designs.js')
  ]);
  assert.match(main, /id="lavCount" aria-live="off"/u);
  assert.match(main, /id="lavCountStatus" role="status" aria-live="polite" aria-atomic="true"/u);
  assert.match(designs, /over !== wasOver/u);
  assert.match(designs, /입력 가능 길이 30,000자를 초과했어요/u);
});

test('공통 UI 토큰은 AA 보조 텍스트, 키보드 포커스, 터치 44px 기준을 고정한다', async () => {
  const css = await read('assets/css/redesign.css');
  assert.match(css, /--text3:#626a7e;/u);
  assert.match(css, /--control-min:44px;/u);
  assert.match(css, /UI integrity hardening/u);
  assert.match(css, /\.gp-search:focus-within\{[\s\S]*?box-shadow:var\(--focus-shadow\)/u);
  assert.match(css, /\.gp-lav-mode button\{[\s\S]*?min-height:44px;[\s\S]*?height:44px;/u);
  assert.match(css, /#pricingContent \.gp-plan-comparison > span/u);
  assert.match(css, /#pricingContent \.gp-plan-efficiency > span/u);
  assert.match(css, /@media\(pointer:coarse\)/u);
  assert.match(css, /\.gp-skip-link:focus\{transform:translateY\(0\);\}/u);
});

test('정적 이미지에는 레이아웃 이동을 막는 고유 크기가 있다', async () => {
  const files = [
    'partials/footer.html', 'partials/login-screen.html', 'pages/main.html',
    'pages/community.html', 'pages/landing.html', 'pages/qna.html'
  ];
  for (const file of files) {
    const html = await read(file);
    const images = html.match(/<img\b[^>]*>/gu) || [];
    assert.ok(images.length > 0, `${file}에는 검사할 이미지가 있어야 한다`);
    for (const image of images) {
      assert.match(image, /\bwidth="\d+"/u, `${file}: width 누락 ${image}`);
      assert.match(image, /\bheight="\d+"/u, `${file}: height 누락 ${image}`);
    }
  }
});

test('정적 연구노트는 skip link와 main landmark, AA muted token을 생성한다', async () => {
  const source = await read('scripts/content-pages.mjs');
  assert.match(source, /--muted:#66647a/u);
  assert.match(source, /<a class="skip-link" href="#contentMain">본문 바로가기<\/a>/u);
  assert.match(source, /<main id="contentMain" tabindex="-1">\$\{bodyHtml\}<\/main>/u);
  assert.match(source, /header\.site a\{display:inline-flex;align-items:center;min-height:44px/u);
});
