import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function loadInputQuality() {
  const source = await fs.readFile(path.join(root, 'assets', 'js', 'input-quality.js'), 'utf8');
  const context = vm.createContext({ window: {} });
  vm.runInContext(source, context);
  return context.window.gpInputQuality;
}

async function read(relativePath) {
  return fs.readFile(path.join(root, relativePath), 'utf8');
}

test('한글 자모 난타와 짧은 패턴 반복은 분석 전에 거부한다', async () => {
  const quality = await loadInputQuality();
  const jamoMash = 'ㅁㄴㅇㄴㅁㅇㄴㅁㅇㅁ'.repeat(14);
  const latinMash = 'asdfgh'.repeat(12);

  assert.equal(quality.assess(jamoMash).readable, false);
  assert.equal(quality.assess(jamoMash).reason, 'standalone_hangul_jamo');
  assert.equal(quality.assess(latinMash).readable, false);
  assert.equal(quality.assess(latinMash).reason, 'repeated_pattern');
});

test('정상 문단과 자모를 설명하는 문장은 입력 검증을 통과한다', async () => {
  const quality = await loadInputQuality();
  const paragraph = '이번 보고서에서는 설문 응답 128건을 분류하고 결과가 달라진 원인을 비교했다. 표에 나온 수치는 원자료와 다시 대조했고, 확인되지 않은 내용은 결론에서 제외했다.';
  const jamoLesson = '한글 자모 ㄱ, ㄴ, ㄷ은 각각 다른 소리를 나타낸다. 수업에서는 자모의 모양과 실제 단어 속 발음을 함께 비교했다.';

  assert.equal(quality.assess(paragraph).readable, true);
  assert.equal(quality.assess(jamoLesson).readable, true);
  assert.match(quality.message, /의미가 있는 문장이나 문단/u);
});

test('컴포저와 서버 오류 처리 모두 반복 입력을 분석 화면 대신 인라인 안내로 돌린다', async () => {
  const [main, boot, designs, evasion] = await Promise.all([
    read('pages/main.html'),
    read('assets/js/app-boot.js'),
    read('assets/js/main-designs.js'),
    read('assets/js/evasion-flow.js')
  ]);

  assert.match(main, /id="lavInputError"[^>]*role="alert"[^>]*hidden/u);
  assert.match(boot, /input-quality\.js/u);
  assert.match(designs, /window\.lavEnsureReadableInput\(text\)/u);
  assert.match(designs, /humanize_input_rejected/u);
  assert.match(evasion, /status === 422 && d && d\.code === 'UNREADABLE_INPUT'/u);
  assert.match(evasion, /err\.httpStatus === 422 && err\.code === 'UNREADABLE_INPUT'/u);
});
