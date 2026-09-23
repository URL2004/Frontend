import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('paragraph integrity notes disclose detector limitations and preserve earlier releases', () => {
  const html = readFileSync(new URL('../pages/admin.html', import.meta.url), 'utf8');
  assert.match(html, /휴머나이징 v2\.5\.63 · AI 감지 v1\.38/);
  assert.match(html, /Backend dc3ae90/);
  assert.match(html, /Backend b0b8efd/);
  assert.match(html, /해결 완료로 표시하지 않습니다/);
  assert.match(html, /Backend 23a3624/);
  const count = [...html.matchAll(/<details class="gp-admin-patch-release"/g)].length;
  assert.equal(count, 80);
  assert.match(html, /80개 변경 묶음/);
  assert.match(html, /v2\.5\.53 · 감지 v1\.34/);
  assert.match(html, /실패 응답과 채택하지 않은 후보/);
});
