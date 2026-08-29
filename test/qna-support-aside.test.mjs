import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('문의 사이드는 FAQ, 서비스 시작, 충전, 운영시간 순으로 안내한다', async () => {
 const qna = await read('pages/qna.html');
 const orderedLabels = [
  'FAQ에서 답 찾기',
  'AI 감지 시작',
  '휴머나이징 시작',
  '충전하기',
  '운영 시간'
 ];
 let cursor = -1;
 for (const label of orderedLabels) {
  const next = qna.indexOf(label);
  assert.ok(next > cursor, `${label} 안내가 올바른 순서에 있어야 한다`);
  cursor = next;
 }
 assert.match(qna, /class="gp-support-balance" data-credit-balance/u);
 assert.match(qna, /openProductMode\('detect'\)/u);
 assert.match(qna, /openProductMode\('humanize'\)/u);
 assert.match(qna, /data-tab="pricing" href="\/pricing"/u);
 assert.match(qna, /평일 기준 1영업일 이내 답변해요/u);
});

test('문의 사이드 패널은 데스크톱에서 고정되고 모바일에서 단일 열로 전환한다', async () => {
 const styles = await read('assets/css/redesign.css');
 assert.match(styles, /#qnaContent \.gp-support-aside\{[\s\S]*?position:sticky;[\s\S]*?top:84px;/u);
 assert.match(styles, /@media\(max-width:600px\)\{[\s\S]*?#qnaContent \.gp-support-dock\{display:block;\}/u);
 assert.match(styles, /#qnaContent \.gp-support-cta\{[\s\S]*?min-height:44px;/u);
 assert.match(styles, /#qnaContent \.gp-support-faq-link\{[\s\S]*?min-height:44px;/u);
});
