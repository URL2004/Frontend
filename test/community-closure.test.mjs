import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('종료된 커뮤니티의 공개 URL은 홈으로 영구 이동한다', () => {
  const config = JSON.parse(read('vercel.json'));
  const redirects = new Map((config.redirects || []).map((rule) => [rule.source, rule]));

  for (const source of ['/community', '/community/:path*', '/pages/community.html']) {
    assert.equal(redirects.get(source)?.destination, '/?mode=humanize&community=closed');
    assert.equal(redirects.get(source)?.permanent, true);
  }
  assert.equal((config.rewrites || []).some((rule) => rule.source === '/community'), false);
});

test('커뮤니티는 앱 라우트와 빌드·검색 노출 목록에서 제외된다', () => {
  const appMain = read('assets/js/app-main.js');
  const pageLoader = read('assets/js/page-loader.js');
  const buildScript = read('scripts/build-vite-static.mjs');
  const routeMeta = read('scripts/route-meta.mjs');
  const sitemapSource = read('sitemap.xml');
  const robots = read('robots.txt');

  assert.doesNotMatch(appMain, /community:\s*'\/community'|\/community':\s*'community'/u);
  assert.match(appMain, /function consumeClosedCommunityRoute\(\)/u);
  assert.doesNotMatch(pageLoader, /pages\/community\.html/u);
  assert.doesNotMatch(routeMeta, /url:\s*'\/community'/u);
  assert.doesNotMatch(sitemapSource, /<loc>https:\/\/gpkorea\.ai\.kr\/community<\/loc>/u);
  assert.match(robots, /Disallow: \/community/u);
  assert.match(buildScript, /fs\.rm\(path\.join\(dist, 'pages', 'community\.html'\), \{ force: true \}\)/u);
});

test('환불 신청 안내는 공개 이메일 대신 사이트 내 고객센터를 사용한다', () => {
  const appMain = read('assets/js/app-main.js');
  const start = appMain.indexOf("} else if (type === 'refund')");
  const end = appMain.indexOf("window.showPolicy = showPolicy", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const refundPolicy = appMain.slice(start, end);

  assert.match(refundPolicy, /사이트 내 고객센터/u);
  assert.doesNotMatch(refundPolicy, /@|고객센터 이메일/u);
});
