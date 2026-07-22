import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'assets', 'js', 'detect-presentation.js'), 'utf8');
const context = { window: {} };
vm.runInNewContext(source, context);
const normalize = context.window.gpNormalizeDetectPresentation;

test('1% 옆의 높은 가능성 문구를 낮은 구간 설명으로 교정한다', () => {
  const out = normalize({
    probability: 1,
    summary: '계획서형 문장으로 정돈되어 AI 생성/보조 작성 가능성이 높습니다.',
    detail: 'AI 생성 가능성이 매우 높습니다.'
  });

  assert.equal(out.riskLevel, 'low');
  assert.equal(out.riskLabel, 'AI 의심 낮음');
  assert.match(out.summary, /낮게 감지/);
  assert.doesNotMatch(out.summary + out.detail, /가능성이 (?:매우 )?높/);
});

test('평균 점수로 합쳐진 결과도 최종 점수 구간을 우선한다', () => {
  const out = normalize({
    probability: 32,
    summary: 'AI가 작성한 글일 가능성이 높아요.',
    detail: 'AI 작성 가능성이 높습니다.'
  });

  assert.equal(out.riskLevel, 'moderate');
  assert.match(out.summary, /일부 감지/);
  assert.match(out.detail, /중간 구간/);
});

test('50%부터 높은 구간으로 모든 화면이 같은 경계를 쓴다', () => {
  assert.equal(normalize({ probability: 20 }).riskLevel, 'low');
  assert.equal(normalize({ probability: 21 }).riskLevel, 'moderate');
  assert.equal(normalize({ probability: 49 }).riskLevel, 'moderate');
  assert.equal(normalize({ probability: 50 }).riskLevel, 'high');
});
