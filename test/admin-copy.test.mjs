import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.join(here, '..', 'assets', 'js', 'app-module.js'), 'utf8');

function loadCopyHelpers() {
  const start = source.indexOf('function adminLegacyCopy(text)');
  const end = source.indexOf('window.adminCopyText = async function(btn)', start);
  assert.ok(start >= 0 && end > start, '관리자 복사 헬퍼를 찾을 수 있어야 한다');

  const state = { appended: null, removed: false, command: null };
  const document = {
    body: { appendChild(el) { state.appended = el; } },
    createElement() {
      return {
        value: '',
        style: {},
        setAttribute() {},
        focus() {},
        select() {},
        setSelectionRange() {},
        remove() { state.removed = true; }
      };
    },
    execCommand(command) {
      state.command = command;
      return command === 'copy';
    }
  };
  const context = {
    document,
    navigator: { clipboard: { writeText: async () => { throw new Error('not allowed'); } } }
  };
  vm.runInNewContext(`${source.slice(start, end)}\n` +
    'globalThis.helpers = { adminLegacyCopy, adminWriteClipboardText };', context);
  return { ...context.helpers, state };
}

test('관리자 작업 기록 복사는 Clipboard API가 막혀도 사용자 제스처 호환 경로를 사용한다', async () => {
  const { adminWriteClipboardText, state } = loadCopyHelpers();
  const text = '첫째 줄\n“인용문”과 결과 본문';

  await adminWriteClipboardText(text);

  assert.equal(state.command, 'copy');
  assert.equal(state.appended.value, text);
  assert.equal(state.removed, true);
});

test('원문·결과는 대용량 data 속성이 아니라 표시 본문에서 직접 읽는다', () => {
  const detailStart = source.indexOf('window.adminToggleLogItem = async function(id)');
  const detailEnd = source.indexOf('// ===== 관리자: 작업 모니터', detailStart);
  const detailBlock = source.slice(detailStart, detailEnd);

  assert.doesNotMatch(detailBlock, /data-copy=/u);
  assert.match(detailBlock, /closest\?\.\('\.gp-admin-log-block'\)/u);
  assert.match(detailBlock, /querySelector\?\.\('\.gp-admin-log-text'\)/u);
  assert.match(detailBlock, /textEl\?\.textContent/u);
});
