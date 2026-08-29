import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('사용자 화면은 AI 감지를 작성자 확정이 아닌 참고 지표로 설명한다', async () => {
  const [detect, faq, index] = await Promise.all([
    read('pages/detect-report.html'),
    read('pages/faq.html'),
    read('index.html')
  ]);

  assert.match(detect, /작성 여부를 확정하는 판정이 아니며/u);
  assert.match(faq, /실제 작성 주체를 확정하지 않아요/u);
  assert.match(index, /AI식 문체 신호를 확인하고/u);
  assert.doesNotMatch(detect + faq + index, /사람답게|100% 보장/u);
});

test('다듬기·기본·고급 설명은 처리 범위와 검증 차이를 같은 기준으로 안내한다', async () => {
  const [faq, guide, main] = await Promise.all([
    read('pages/faq.html'),
    read('pages/guide.html'),
    read('pages/main.html')
  ]);
  const copy = faq + guide + main;

  assert.match(copy, /원문 보존 다듬기/u);
  assert.match(copy, /비문·띄어쓰기·어색한 연결·중복 표현/u);
  assert.match(copy, /기본 휴머나이징/u);
  assert.match(copy, /고급 휴머나이징/u);
  assert.match(copy, /의미·수치·인용·구조 정밀 검증/u);
});

test('공통 안내문은 붙여 쓰는 요청형과 모호한 히스토리 명칭을 남기지 않는다', async () => {
  const [feedback, shell, history, guide] = await Promise.all([
    read('assets/js/ui-feedback.js'),
    read('partials/app-shell-start.html'),
    read('pages/history.html'),
    read('pages/guide.html')
  ]);
  const copy = feedback + shell + history + guide;

  assert.doesNotMatch(copy, /입력해주세요|확인해주세요|분석 히스토리|보관함·히스토리/u);
  assert.match(copy, /작업 기록/u);
});
