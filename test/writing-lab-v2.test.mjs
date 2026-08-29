import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('글쓰기 랩은 5단계 장르별 질문과 사용자가 고르는 부족 정보 대응을 제공한다', async () => {
  const [page, source] = await Promise.all([
    read('pages/writing-lab.html'),
    read('assets/js/writing-lab.js')
  ]);
  for (const step of ['글 선택', '내용 입력', '글 설정', '작성 확인', '결과']) assert.match(page, new RegExp(step, 'u'));
  for (const genre of ['resume', 'review_blog', 'marketing', 'general']) assert.match(page, new RegExp(`data-genre="${genre}"`, 'u'));
  assert.match(page, /모르는 내용은 비워도 괜찮아요/u);
  assert.match(page, /정보 더 입력하기/u);
  assert.match(page, /지금 정보로 짧게 쓰기/u);
  assert.match(source, /assessment\.options/u);
  assert.match(source, /write_short/u);
  assert.match(source, /renderReadiness/u);
});

test('v2 API와 기존 휴머나이징 엔진은 검증 토큰을 사이에 두고 연결된다', async () => {
  const source = await read('assets/js/writing-lab.js');
  for (const endpoint of ['/writing-lab/v2/config', '/writing-lab/v2/extract', '/writing-lab/v2/prepare', '/writing-lab/v2/generate', '/writing-lab/v2/finalize', '/writing-lab/v2/check', '/transform']) {
    assert.match(source, new RegExp(endpoint.replaceAll('/', '\\/'), 'u'));
  }
  assert.match(source, /verificationToken/u);
  assert.match(source, /assessmentToken/u);
  assert.match(source, /requestId/u);
  assert.match(source, /\/writing-lab\/v2\/jobs\//u);
  assert.match(source, /adminHumanizeLab/u);
  assert.match(source, /adminLabProfile = 'gpt_engine'/u);
  assert.match(source, /documentProfile/u);
  assert.match(source, /length: 'keep'/u);
  assert.match(source, /effectNoticeAccepted: true/u);
  assert.match(source, /\['resume', 'general'\].*\? 'polish' : 'blog'/u);
  assert.match(source, /새 사실·행동·순서·수치·평가를 만들지 말고/u);
});

test('휴머나이징·검수 실패는 진행 상태를 닫고 검증된 초안으로 복구한다', async () => {
  const source = await read('assets/js/writing-lab.js');
  assert.match(source, /function useSafeDraft/u);
  assert.match(source, /generation\.draft/u);
  assert.match(source, /setProgress\(failedStage, 'fail'\)/u);
  assert.match(source, /setGenerationBusy\(false\)/u);
  assert.match(source, /검증된 초안을 대신 보여드려요/u);
  assert.match(source, /releasePass/u);
  assert.match(source, /recoverActivePipeline/u);
  assert.match(source, /recoverPendingGeneration/u);
  assert.match(source, /최종 점검을 통과한 글만 복사/u);
  assert.match(source, /delivery\.source === 'verified_generation_fallback'/u);
  assert.match(source, /delivery\.source === 'humanized_repaired'/u);
});

test('복사는 Clipboard 실패 폴백을 사용하고 수정본은 재검수 전 검수 완료 상태가 해제된다', async () => {
  const source = await read('assets/js/writing-lab.js');
  assert.match(source, /navigator\.clipboard/u);
  assert.match(source, /document\.execCommand\('copy'\)/u);
  assert.match(source, /window\.wlFinalEdited/u);
  assert.match(source, /수정본 검수 필요/u);
  assert.match(source, /window\.wlRecheck/u);
});

test('글쓰기 랩은 작은 화면에서 질문·검수 지표·진행 단계를 한 열로 정리한다', async () => {
  const styles = await read('assets/css/writing-lab.css');
  assert.match(styles, /@media \(max-width:760px\)/u);
  assert.match(styles, /\.gp-wl-genres,.gp-wl-fields,.gp-wl-settings-grid,.gp-wl-readiness-columns\{grid-template-columns:1fr;\}/u);
  assert.match(styles, /@media \(max-width:560px\)/u);
  assert.match(styles, /\.gp-wl-progress\{grid-template-columns:1fr;\}/u);
  assert.match(styles, /prefers-reduced-motion:reduce/u);
});
