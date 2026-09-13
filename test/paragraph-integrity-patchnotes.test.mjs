import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('paragraph integrity notes disclose detector limitations and preserve earlier releases', () => {
  const html = readFileSync(new URL('../pages/admin.html', import.meta.url), 'utf8');
  assert.match(html, /휴머나이징 v2\.5\.51 · AI 감지 v1\.32/);
  assert.match(html, /Backend b0b8efd/);
  assert.match(html, /해결 완료로 표시하지 않습니다/);
  assert.match(html, /Backend 23a3624/);
  const count = [...html.matchAll(/<details class="gp-admin-patch-release"/g)].length;
  assert.equal(count, 65);
  assert.match(html, /65개 변경 묶음/);
});
