import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

// 2026-09-04 사고: 계좌 잔액부족으로 결제가 거절된 사용자가 12분 동안 3번 재시도했다.
// 화면에는 실패 이유 대신 "충전을 마치지 못했어요. 결제가 됐는데 크레딧이 안 보이면
// 고객센터로 문의해 주세요"만 떴다. 사용자는 결제가 된 줄 알고 되풀이했고,
// 그 재시도가 서버에서 SEV2 알림 9건 + SEV1 급증 1건으로 증폭됐다.
test('거절된 결제는 결제사 원문 사유를 그대로 보여 준다', async () => {
  const callbacks = await read('assets/js/payment-callbacks.js');

  // 서버가 내려보내는 거절 표시를 실제로 읽어야 한다.
  assert.match(callbacks, /data\.declined === true && data\.error/u);
  assert.match(callbacks, /var failMessage = declineMessage/u);

  // 일반 문구는 폴백으로만 남는다 — 무조건 띄우면 안 된다.
  const genericToastCall = /gpToast\('충전을 마치지 못했어요/u;
  assert.equal(genericToastCall.test(callbacks), false, '일반 문구를 직접 띄우면 거절 사유가 가려진다');
  assert.match(callbacks, /충전을 마치지 못했어요\. 결제가 됐는데 크레딧이 안 보이면/u, '폴백 문구 자체는 유지한다');

  // 사용자가 그 자리에서 재시도할 수 있어야 하므로 성공 마커를 남기지 않는다.
  const declineBlock = callbacks.slice(callbacks.indexOf('confirm_api_failed'));
  assert.equal(
    /localStorage\.setItem\(storageKey/u.test(declineBlock.slice(0, declineBlock.indexOf('return false'))),
    false,
    '거절 경로에서 결제 완료 마커를 남기면 안 된다'
  );
});

test('결제 오류 보고는 서버 분류 사유를 함께 실어 보낸다', async () => {
  const api = await read('assets/js/api.js');
  const callbacks = await read('assets/js/payment-callbacks.js');

  // 서버 로그(payment.customer_declined)와 프런트 보고(client.payment_declined)를
  // 같은 어휘로 맞춰 두 줄을 orderId로 이어 볼 수 있게 한다.
  assert.match(api, /declineCategory: cleanText\(raw\.declineCategory, 40\)/u);
  assert.match(callbacks, /declineCategory: data\.declineCategory \|\| ''/u);
});
