import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => readFile(path.join(root, relative), 'utf8');

const forbiddenCommunityFixtures = [
  /demo-post/u,
  /demo\s*:\s*true/u,
  /_mockDate/u,
  /블로그 글을 자연스럽게 다듬는 루틴/u,
  /교수님이 좋아하는 보고서 작성법/u,
  /서론에서 시선 끄는 문장 쓰는 법/u,
  /인용과 출처를 정확하게 표시하는 법/u,
  /반복 표현을 줄이는 문장 수정 예시/u
];

function assertNoFixtures(source, label) {
  for (const pattern of forbiddenCommunityFixtures) {
    assert.doesNotMatch(source, pattern, `${label}에 임의 커뮤니티 글이 남아 있습니다: ${pattern}`);
  }
}

test('커뮤니티 원천에는 임의 게시글·정적 인기 수치가 없다', async () => {
  const [page, module] = await Promise.all([
    read('pages/community.html'),
    read('assets/js/app-module.js')
  ]);

  assertNoFixtures(`${page}\n${module}`, '커뮤니티 원천');
  assert.match(page, /<ol class="gp-rank-list" id="rankList"><\/ol>/u);
});

test('비로그인은 Firestore 조회 전에 캐시와 게시글 표면을 비우고 로그인 CTA만 받는다', async () => {
  const module = await read('assets/js/app-module.js');
  const loadPosts = module.slice(
    module.indexOf('window.loadPosts = async'),
    module.indexOf('window.submitPost = async')
  );
  const gate = module.slice(
    module.indexOf('function _clearCommunityPostSurfaces'),
    module.indexOf('window.filterByCategory')
  );

  assert.ok(loadPosts.indexOf('if (!CU)') < loadPosts.indexOf("getDocs(collection(db,'posts'))"));
  assert.match(loadPosts, /if \(!CU\) \{\s*_showCommunityLoginGate\(\);\s*return;/u);
  assert.match(gate, /window\._cachedPosts = \[\]/u);
  assert.match(gate, /rankList\.innerHTML = ''/u);
  assert.match(gate, /로그인하면 실제 커뮤니티 글을 확인할 수 있어요/u);
  assert.match(gate, /onclick="openCommunityLogin\(\)"/u);
});

test('검색·카테고리·정렬·페이지네이션은 하나의 필터 결과를 사용한다', async () => {
  const [page, module] = await Promise.all([
    read('pages/community.html'),
    read('assets/js/app-module.js')
  ]);

  assert.match(page, /id="postSearch"[^>]+oninput="queuePostSearch\(this\.value\)"[^>]+onkeydown="[^"]*event\.key==='Enter'[^"]*applyPostSearch/u);
  assert.match(page, /id="postSearchBtn"[^>]+onclick="applyPostSearch\(\)"/u);
  assert.match(module, /function _filteredSortedPosts\(\)[\s\S]*window\.currentCategory[\s\S]*window\.postSearch[\s\S]*window\.sortBy/u);
  assert.match(module, /function _renderPostPage\(\)[\s\S]*const posts = _filteredSortedPosts\(\)/u);
  assert.match(module, /window\.gotoPostPage[\s\S]*_filteredSortedPosts\(\)\.length/u);
  assert.match(module, /setTimeout\(\(\) => window\.applyPostSearch\(value\), 250\)/u);
});

test('블로그 카테고리는 신규 정본으로 저장하고 기존 값은 읽기에서만 정규화한다', async () => {
  const [page, module] = await Promise.all([
    read('pages/community.html'),
    read('assets/js/app-module.js')
  ]);

  assert.match(page, /option value="블로그 작성 팁">블로그 작성 팁/u);
  assert.match(page, /data-cat="블로그 작성 팁"[^>]+filterByCategory\('블로그 작성 팁'\)/u);
  assert.doesNotMatch(page, /value="블로그 작성 꿀팁"|data-cat="블로그 작성 꿀팁"/u);
  assert.match(module, /value === '블로그 작성 꿀팁' \? '블로그 작성 팁' : value/u);
  assert.match(module, /posts\.push\(\{id:d\.id,\.\.\.data,category:_normalizePostCategory\(data\.category\)\}\)/u);
  assert.match(module, /const category = _normalizePostCategory\(\(catEl && catEl\.value\)/u);
});

test('로그아웃 상태에서는 커뮤니티 작성 폼을 열기 전에 로그인 화면으로 전환한다', async () => {
  const [page, module] = await Promise.all([
    read('pages/community.html'),
    read('assets/js/app-module.js')
  ]);
  const composer = module.slice(
    module.indexOf('window.openCommunityComposer'),
    module.indexOf('window.filterByCategory')
  );

  assert.match(page, /onclick="openCommunityComposer\(\)"/u);
  assert.match(composer, /if \(!CU\)[\s\S]*form\.style\.display = 'none'[\s\S]*window\.openCommunityLogin\(\)[\s\S]*return;/u);
  assert.ok(composer.indexOf('if (!CU)') < composer.lastIndexOf("form.style.display = form.style.display === 'block'"));
});

async function collectTextFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await collectTextFiles(absolute));
    else if (/\.(?:html|js|mjs)$/u.test(entry.name)) files.push(absolute);
  }
  return files;
}

test('최신 빌드 산출물에도 임의 커뮤니티 글이 없다', async t => {
  const dist = path.join(root, 'dist');
  let distStat;
  try {
    distStat = await stat(path.join(dist, 'assets/js/app-module.js'));
  } catch {
    t.skip('빌드 산출물이 없어 원천 검사만 수행합니다.');
    return;
  }
  const sourceStats = await Promise.all([
    stat(path.join(root, 'assets/js/app-module.js')),
    stat(path.join(root, 'pages/community.html'))
  ]);
  if (distStat.mtimeMs < Math.max(...sourceStats.map(item => item.mtimeMs))) {
    t.skip('빌드 산출물이 원천보다 오래되어 원천 검사만 수행합니다.');
    return;
  }

  const files = await collectTextFiles(dist);
  for (const file of files) {
    assertNoFixtures(await readFile(file, 'utf8'), path.relative(root, file));
  }
});
