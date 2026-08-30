import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = (relative) => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('종료된 커뮤니티용 EmailJS SDK와 임의 수신자 호출 표면을 로드하지 않는다', () => {
  const sources = [
    read('assets/js/app-boot.js'),
    read('assets/js/app-module.js'),
    read('assets/js/config.js')
  ].join('\n');

  assert.doesNotMatch(sources, /emailjs|EMAILJS_PUBLIC_KEY|sendEmailNotification/iu);
  assert.equal(fs.existsSync(new URL('../assets/js/email-init.js', import.meta.url)), false);
});

test('분석 페이지 주소에서 결제·인증 쿼리를 제거한다', () => {
  const tracking = read('assets/js/head-tracking.js');
  assert.match(tracking, /function analyticsSafeLocation\(value\)/u);
  for (const key of ['paymentKey', 'orderId', 'uid', 'authKey']) {
    assert.match(tracking, new RegExp(`['"]${key}['"]`, 'u'));
  }
  assert.match(tracking, /var pageLocation = analyticsSafeLocation\(locationUrl \|\| window\.location\.href\)/u);
});

test('결제 오류의 환불·문의 안내는 사이트 내 고객센터만 사용한다', () => {
  const callbacks = read('assets/js/payment-callbacks.js');
  assert.match(callbacks, /사이트 내 고객센터로 문의/u);
  assert.doesNotMatch(callbacks, /고객센터 이메일|@naver\.com/u);
});

test('마이페이지의 사용자 닉네임과 이메일은 HTML 삽입 전에 이스케이프한다', () => {
  const module = read('assets/js/app-module.js');
  assert.match(module, /escapeHtml\(window\.getAdminName\(\)\|\|CU\.displayName\)/u);
  assert.match(module, /escapeHtml\(CU\.email\)/u);
  assert.doesNotMatch(module, /font-weight:700;[^\n]+\+\(window\.getAdminName\(\)\|\|CU\.displayName\)\+/u);
});
