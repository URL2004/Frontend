import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();

async function read(rel) {
  return fs.readFile(path.join(root, rel), 'utf8');
}

async function write(rel, value) {
  await fs.writeFile(path.join(root, rel), value.replace(/\r\n/g, '\n'), 'utf8');
}

async function pruneMain() {
  const rel = 'pages/main.html';
  const source = await read(rel);
  const marker = '<div class="gp-main-stage">';
  const start = source.indexOf(marker);
  if (start < 0) return;
  const before = source.slice(0, start).trimEnd();
  await write(rel, `${before}\n</div>\n`);
}

function removeSimpleRules(source, selectorPattern) {
  const rule = /(^|\n)([^@{}][^{}]*)\{([^{}]*)\}/g;
  return source.replace(rule, (full, lead, selector) => (
    selectorPattern.test(selector) ? lead : full
  ));
}

async function pruneRedesignCss() {
  const rel = 'assets/css/redesign.css';
  const source = await read(rel);
  const label = 'Seventh design: Lavender SaaS';
  const labelAt = source.indexOf(label);
  if (labelAt < 0) throw new Error(`Missing ${label} marker`);
  const segmentAt = source.lastIndexOf('/*', labelAt);
  let lavender = source.slice(segmentAt);
  lavender = removeSimpleRules(lavender, /body\.dark/u);
  lavender = removeSimpleRules(lavender, /(?:gp-design-picker|gp-design-option|gp-main-stage|gp-sketch-page|gp-clean-page|gp-hub-page|gp-neon-page|lowbanner|preview-lavender)/u);
  const breakpointMap = new Map([
    ['390', '560'], ['420', '560'], ['430', '560'], ['480', '560'],
    ['640', '760'], ['680', '760'], ['700', '760'], ['720', '760'], ['769', '760'],
    ['820', '960'], ['860', '960'], ['861', '960'], ['900', '960'], ['940', '960'], ['941', '960'], ['980', '960'],
    ['1240', '1180']
  ]);
  lavender = lavender.replace(/(@media\s*\((?:max|min)-width:\s*)(\d+)(px\))/gu, (all, before, width, after) => (
    `${before}${breakpointMap.get(width) || width}${after}`
  ));
  lavender = lavender.replace(/"Pretendard","Noto Sans KR",/gu, '"Pretendard",');
  lavender = lavender.replace(/사장님 지시/gu, '기존 운영 결정').replace(/사장님/gu, '운영 결정');
  const tokens = `/* Light lavender application tokens — single source of truth. */
:root{
  --brand:#5a5bd8;
  --brand-strong:#4b4cc6;
  --brand-soft:#efeffd;
  --bg:#f1f2f8;
  --surface:#fff;
  --surface2:#f7f8fc;
  --surface3:#eef0f8;
  --border:#e4e7f1;
  --text:#1a1f2e;
  --text2:#525a6e;
  --text3:#747c90;
  --red:#c43f35;
  --green:#247a45;
  --blue:#4b4cc6;
  --yellow:#9b6816;
  --accent:var(--brand);
  --font:"Pretendard",system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  --space-1:4px;
  --space-2:8px;
  --space-3:12px;
  --space-4:16px;
  --space-6:24px;
  --space-8:32px;
  --space-12:48px;
  --radius-control:10px;
  --radius-card:14px;
  --r:var(--radius-card);
  --rs:var(--radius-control);
  --layer-checkout:10020;
  --layer-panel:10030;
  --layer-confirm:10035;
  --layer-dialog:10040;
  --layer-toast:10050;
}
[hidden]{display:none!important;}
`;
  await write(rel, `${tokens}\n${lavender.trimStart()}`);
}

async function removeDarkAppRules() {
  const rel = 'assets/css/app.css';
  let source = await read(rel);
  source = removeSimpleRules(source, /body\.dark/u);
  source = removeSimpleRules(source, /lowbanner/u);
  source = source.replace(/body:not\(\.dark\)::before/gu, 'body::before');
  source = source.replace(/--font:"Pretendard","Noto Sans KR",system-ui,sans-serif;/u, '--font:"Pretendard",system-ui,sans-serif;');
  const breakpointMap = new Map([
    ['390', '560'], ['420', '560'], ['430', '560'], ['480', '560'], ['600', '560'],
    ['640', '760'], ['680', '760'], ['700', '760'], ['720', '760'], ['769', '760'],
    ['820', '960'], ['860', '960'], ['861', '960'], ['900', '960'], ['940', '960'], ['941', '960'], ['980', '960'],
    ['1240', '1180']
  ]);
  source = source.replace(/(@media\s*\((?:max|min)-width:\s*)(\d+)(px\))/gu, (all, before, width, after) => (
    `${before}${breakpointMap.get(width) || width}${after}`
  ));
  if (!source.includes('[hidden]{display:none!important;}')) {
    source = `[hidden]{display:none!important;}\n${source}`;
  }
  await write(rel, source);
}

async function pruneDuplicateShells() {
  await write('partials/app-shell-start.html', `<div id="appScreen" class="screen active">
  <div class="app-layout">
    <a class="gp-skip-link" href="#gpRouteContent">본문 바로가기</a>
    <main class="main-content gp-main" id="gpRouteContent" tabindex="-1">
      <div id="mypage" class="tab-content" hidden></div>
`);
  await write('partials/app-shell-end.html', `    </main>
  </div>
</div>
`);
  await write('partials/mobile-nav.html', '');
}

async function pruneAppMain() {
  const rel = 'assets/js/app-main.js';
  let source = await read(rel);
  const start = source.indexOf('const SUB_PLAN_INFO = {');
  const end = source.indexOf('function showPolicy(type)', start);
  if (start >= 0 && end > start) source = `${source.slice(0, start)}${source.slice(end)}`;
  source = source.replace(/사장님[^\n]*(?:\n|$)/gu, '');
  await write(rel, source);
}

async function pruneLocalLibrary() {
  const rel = 'assets/js/evasion-flow.js';
  let source = await read(rel);
  const start = source.indexOf('  // ── 보관함(localStorage 기반');
  if (start >= 0) {
    const close = source.indexOf('})();', start);
    if (close < 0) throw new Error('Could not find evasion-flow closure after local library');
    source = `${source.slice(0, start)}${source.slice(close)}`;
  }
  await write(rel, source);
}

await pruneMain();
await pruneRedesignCss();
await removeDarkAppRules();
await pruneDuplicateShells();
await pruneAppMain();
await pruneLocalLibrary();
