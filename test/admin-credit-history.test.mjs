import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const moduleSource = fs.readFileSync(path.join(here, '..', 'assets', 'js', 'app-module.js'), 'utf8');
const adminHtml = fs.readFileSync(path.join(here, '..', 'pages', 'admin.html'), 'utf8');

function loadHistoryHelpers() {
  const start = moduleSource.indexOf('function adminUsageHistory(data)');
  const end = moduleSource.indexOf('function adminSelectedChargeOrder(index)', start);
  assert.ok(start >= 0 && end > start, '관리자 크레딧 분리 헬퍼를 찾을 수 있어야 한다');
  const context = {};
  vm.runInNewContext(`${moduleSource.slice(start, end)}\n` +
    'globalThis.helpers = { adminUsageHistory, adminChargeHistory };', context);
  return context.helpers;
}

test('관리자 사용자 관리는 사용 내역과 충전 내역을 별도 데이터로 표시한다', () => {
  const helpers = loadHistoryHelpers();
  const charge = { id: 'charge-1', type: 'charge' };
  const usage = { id: 'usage-1', type: 'humanize' };
  const order = { id: 'order-1', kind: 'order' };

  assert.deepEqual(
    Array.from(helpers.adminUsageHistory({ creditHistory: [charge, usage] }), row => row.id),
    ['usage-1']
  );
  assert.deepEqual(
    Array.from(helpers.adminChargeHistory({ chargeHistory: [order] }), row => row.id),
    ['order-1']
  );
  assert.match(adminHtml, /gp-admin-action-title">충전 내역</u);
  assert.match(moduleSource, /gp-admin-ledger-head">사용 내역/u);
  assert.match(moduleSource, /일반 충전·정기결제 및 환불 상태/u);
  assert.doesNotMatch(moduleSource, /gp-admin-ledger-head">전체 크레딧 내역/u);
});

test('충전 내역 페이징 뒤에도 원본 주문 인덱스로 환불한다', () => {
  assert.match(moduleSource, /const orderIndex = chargeStart \+ i/u);
  assert.match(moduleSource, /adminDirectRefund\(\$\{orderIndex\}\)/u);
  assert.match(moduleSource, /adminSelectedChargeOrder\(i\)/u);
});
