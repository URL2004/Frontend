import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('알림 목록과 실시간 카드에서 큰 상세 모달을 열고 SVG 아이콘을 사용한다', async () => {
  const [feedback, module, css] = await Promise.all([read('assets/js/ui-feedback.js'), read('assets/js/app-module.js'), read('assets/css/redesign.css')]);
  assert.match(feedback, /openNotificationDetail\(n\)/u);
  assert.match(feedback, /openNotificationDetail\(current\)/u);
  assert.match(feedback, /variant: 'notification-detail'/u);
  assert.match(feedback, /await window.markRead\(n.id\)/u);
  assert.match(feedback, /async function markNotificationRead\(n\) \{\s*if \(n.read\) return;/u);
  assert.match(module, /onclick="gpOpenNotification/u);
  assert.match(css, /variant-notification-detail[^\n]*680px/u);
  assert.match(css, /#gpDialogMessage[^\n]*white-space:pre-wrap/u);
  assert.match(feedback, /gp-operator-float-icon" aria-hidden="true"><svg/u);
  assert.doesNotMatch(feedback, /gp-operator-float-icon material-symbols/u);
});

test('계정 전환·다른 탭 읽음 처리·지연 목록 응답을 분리한다', async () => {
  const [feedback, module] = await Promise.all([read('assets/js/ui-feedback.js'), read('assets/js/app-module.js')]);
  assert.match(feedback, /owner !== floatOwner[\s\S]*?floatQueue = \[\];[\s\S]*?floatShownIds = \{\}/u);
  assert.match(module, /c.type === 'removed'/u);
  assert.match(module, /gpRemoveRemoteNotifications\(removed\)/u);
  assert.match(module, /if \(!CU \|\| CU.uid !== ownerUid\) return;/u);
  assert.match(feedback, /rememberFloated\(current\);/u);
});

test('읽음 저장 실패는 알리고 재시도를 허용하며 다음 메시지를 삭제하지 않는다', async () => {
  const feedback = await read('assets/js/ui-feedback.js');
  const ack = feedback.split('async function dismissOperatorFloat(mode)')[1].split("if (mode === 'open')")[0];
  assert.match(ack, /await window.markRead\(current.id\)/u);
  assert.match(ack, /읽음 처리에 실패했어요/u);
  assert.match(ack, /finally \{ button.disabled = false; \}/u);
  assert.match(ack, /filter\(function \(n\) \{ return n.id !== current.id; \}\)/u);
});

test('안 읽은 알림이 있으면 벨을 강조하고 새 알림이 들어오면 한 번 더 흔든다', async () => {
  const [feedback, css] = await Promise.all([read('assets/js/ui-feedback.js'), read('assets/css/redesign.css')]);
  assert.match(feedback, /bell\.classList\.toggle\('has-unread', unread > 0\)/u);
  assert.match(feedback, /if \(lastUnread >= 0 && unread > lastUnread\) ringBell\(\)/u);
  assert.match(feedback, /setAttribute\('aria-expanded', open \? 'true' : 'false'\)/u);

  const start = css.indexOf('lavender v128: 알림 벨 강조');
  const mypage = css.indexOf('lavender v119: 내 정보 재설계');
  assert.ok(start >= 0 && start < mypage, 'v128 블록은 반복 애니메이션 금지 구간(v119~v116) 앞에 있어야 한다');
  const block = css.slice(start, mypage);
  // 반복 애니메이션은 움직임 줄이기 설정을 존중하는 미디어 쿼리 안에만 둔다.
  const motion = block.slice(block.indexOf('@media (prefers-reduced-motion:no-preference){'));
  assert.match(motion.slice(0, motion.indexOf('\n}')), /\.has-unread \.gp-bell-icon\{animation:gpBellNudge[^}]*infinite;\}/u);
  assert.match(block, /\[aria-expanded="true"\] \.gp-bell-icon,[\s\S]*?\{animation:none;\}/u);
  assert.match(block, /\.gp-operator-float\[hidden\]\{display:none!important\}/u);
});

test('운영팀 메시지는 실시간으로 받아 기기마다 한 번 플로팅으로 띄운다', async () => {
  const [feedback, module] = await Promise.all([read('assets/js/ui-feedback.js'), read('assets/js/app-module.js')]);
  assert.match(module, /import \{[^}]*\bonSnapshot\b[^}]*\} from "https:\/\/www\.gstatic\.com\/firebasejs\/10\.12\.0\/firebase-firestore\.js"/u);
  assert.match(module, /onSnapshot\(\s*query\(collection\(db,'users',uid,'notifications'\), where\('read','==',false\)\)/u);
  assert.match(module, /window\.updateNotifBadge\(u\.uid\);\s*startNotificationWatch\(u\.uid\);/u);
  assert.match(module, /stopNotificationWatch\(\);\s*if \(window\.gpSetRemoteNotifications\) window\.gpSetRemoteNotifications\(\[\]\);/u);

  // 운영 서버가 쓰는 알림만(관리자 발송·장애 안내·문의 답변) 플로팅 대상이다.
  assert.match(feedback, /return \/\^qna_answered_\/\.test\(key\)/u);
  assert.match(feedback, /n\.type === 'notice' && \/\^\(admin_\|job_incident_\)\/\.test\(key\)/u);
  assert.match(feedback, /var floatMaxAgeMs = 7 \* 86400000;/u);
  assert.match(feedback, /floatKeyPrefix \+ uid/u);
  // 메시지 본문은 textContent로만 넣는다.
  assert.match(feedback, /\$\('gpOperatorFloatMessage'\)\.textContent = current\.message;/u);
  assert.doesNotMatch(feedback, /gpOperatorFloatMessage'\)\.innerHTML/u);
});

test('관리자 알림 발송 모달은 넓은 입력창과 500자 카운터를 쓴다', async () => {
  const [module, feedback, css] = await Promise.all([
    read('assets/js/app-module.js'), read('assets/js/ui-feedback.js'), read('assets/css/redesign.css')
  ]);
  const prompts = module.match(/gpPrompt\(\{ title: '(?:영향 사용자 알림|사용자 알림)'[^\n]*/gu) || [];
  assert.equal(prompts.length, 2);
  for (const call of prompts) assert.match(call, /variant: 'notify', rows: 8, maxLength: 500/u);
  assert.match(feedback, /root\.classList\.toggle\('variant-notify', opts\.variant === 'notify'\)/u);
  assert.match(css, /\.gp-dialog-root\.variant-notify \.gp-dialog-card\{width:min\(640px,100%\);/u);
});
