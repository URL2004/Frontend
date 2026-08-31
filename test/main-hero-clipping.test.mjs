// 메인 입력 화면 로고 잘림 회귀 방지(2026-08-31).
//
// 배경: 큰 화면에서 입력창을 시선 중앙에 두려고 .gp-lav-hero를 translateY로 위로 당긴다.
// 그런데 #mainContent[data-main-design="lavender"]가 overflow:clip이라, 당긴 양이 상단 여유보다
// 크면 로고 윗부분이 잘린 채 스크롤로도 되돌릴 수 없다. 실제로 창 높이 900~1080px 구간
// (작은 노트북·창 모드 브라우저)에서 로고가 13~41px 잘려 있었다.
//
// 고침: 당김에 뷰포트 높이 기반 안전 하한 calc(Cpx - 50vh)를 걸어 둘 중 덜 당기는 쪽을 쓴다.
// 아래 검사는 그 하한이 사라지거나 느슨해지면 깨진다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// 실측 기준(2026-08-31, 폭 960~1920 × 높이 880~1440 · 오퍼 배너 유무 176조합):
// 변형 전 로고 상단 = 0.5 × 창높이 − 372px 근처가 최악값이었고, 로고를 16px 이상 남기려면
// 하한 상수 C는 388px 이상이어야 한다. C가 이보다 작아지면 다시 잘리기 시작한다.
const MIN_FLOOR_CONSTANT = 388;

test('메인 히어로 상향 이동은 뷰포트 높이 하한을 지켜 로고를 자르지 않는다', async () => {
  const css = await read('assets/css/redesign.css');
  const rule = /@media\(min-width:960px\) and \(min-height:900px\)\{\s*#mainContent\[data-main-design="lavender"\] \.gp-lav-hero:not\(\.flow-active\)\{\s*transform:([^;]+);/u.exec(css);
  assert.ok(rule, '히어로 상향 이동 규칙을 찾지 못했습니다 — 선택자가 바뀌면 이 검사도 함께 고쳐야 합니다.');

  const transform = rule[1].replace(/\s+/gu, '');
  assert.match(transform, /^translateY\(max\(/u, '상향 이동은 반드시 안전 하한과 max()로 묶어야 합니다.');

  const floor = /calc\((\d+)px-50vh\)/u.exec(transform);
  assert.ok(floor, '뷰포트 높이 기반 하한 calc(Npx - 50vh)이 없습니다.');
  assert.ok(
    Number(floor[1]) >= MIN_FLOOR_CONSTANT,
    `하한 상수가 ${floor[1]}px로 너무 작습니다 — ${MIN_FLOOR_CONSTANT}px 이상이어야 창 높이 900~1080px에서 로고가 잘리지 않습니다.`
  );
});

test('모바일 히어로는 상향 이동 없이 위에서부터 쌓는다', async () => {
  const css = await read('assets/css/redesign.css');
  const blocks = [...css.matchAll(/\.gp-lav-hero:not\(\.flow-active\)\{([^}]*)\}/gu)].map(match => match[1]);
  const mobile = blocks.filter(body => /margin:0 auto auto/u.test(body));
  assert.equal(mobile.length, 1, '모바일 히어로 규칙(margin:0 auto auto)을 하나만 찾을 수 있어야 합니다.');
  assert.doesNotMatch(mobile[0], /transform:/u, '좁은 화면에서는 위로 당기지 않습니다 — 잘림을 되돌릴 여유가 없습니다.');
});
