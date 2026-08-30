import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('충전하기와 초대하기, 문의 충전 CTA는 같은 공통 버튼 클래스를 쓴다', async () => {
 const [main, qna] = await Promise.all([read('pages/main.html'), read('pages/qna.html')]);
 assert.match(main, /class="gp-invite-btn gp-gradient-action"[^>]*>초대하기<\/button>/u);
 assert.match(main, /class="ls-upgrade-btn gp-gradient-action"[^>]*id="lsUpgradeBtn"[^>]*>충전하기<\/button>/u);
 assert.match(qna, /class="gp-support-cta charge gp-gradient-action"[^>]*href="\/pricing"/u);
});

test('공통 전환 버튼은 동일한 높이, 모서리, 내부 면을 유지한다', async () => {
 const [main, styles] = await Promise.all([read('pages/main.html'), read('assets/css/redesign.css')]);
 assert.match(styles, /\.ls-upgrade-btn\.gp-gradient-action,[\s\S]*?\.gp-invite-btn\.gp-gradient-action,[\s\S]*?\.gp-support-cta\.gp-gradient-action\{[\s\S]*?height:42px !important;[\s\S]*?border-radius:10px !important;[\s\S]*?linear-gradient\(144deg,#af40ff,#5b42f3 50%,#00ddeb\)/u);
 assert.match(styles, /\.ls-upgrade-btn\.gp-gradient-action\{\s*min-width:110px;[\s\S]*?\.gp-lav-top-right \.ls-credit-btn\{\s*min-width:110px;/u);
 assert.match(styles, /\.gp-lav-top-right :is\(\.ls-credit-btn,\.ls-upgrade-btn\.gp-gradient-action,\.gp-lav-guide\)\{\s*height:42px !important;\s*min-height:42px !important;/u);
 assert.doesNotMatch(main, /gp-lav-mobile-pricing/u);
 assert.doesNotMatch(styles, /gp-lav-mobile-pricing/u);
 assert.match(styles, /\.gp-invite-btn\.gp-gradient-action::before,[\s\S]*?\.gp-support-cta\.gp-gradient-action::before\{[\s\S]*?inset:3px;[\s\S]*?background:rgb\(5,6,45\)/u);
});

test('모바일 상단은 공통 버튼 복구 뒤에도 중복 충전 버튼을 다시 노출하지 않는다', async () => {
 const styles = await read('assets/css/redesign.css');
 const sharedRestore = styles.lastIndexOf('display:inline-flex !important;');
 const mobileHide = styles.lastIndexOf('#mainContent[data-main-design="lavender"] .gp-lav-top-right .ls-upgrade-btn.gp-gradient-action{');
 assert.ok(sharedRestore >= 0, '공통 전환 버튼 복구 규칙이 있어야 한다');
 assert.ok(mobileHide > sharedRestore, '모바일 숨김 규칙이 공통 복구 규칙보다 뒤에 있어야 한다');
 assert.match(styles.slice(sharedRestore), /@media\(max-width:560px\)\{[\s\S]*?\.gp-lav-top-right\{[\s\S]*?gap:8px;[\s\S]*?margin-right:max\(8px,env\(safe-area-inset-right\)\);/u);
 assert.match(styles.slice(mobileHide), /display:none !important;/u);
 assert.match(styles.slice(mobileHide), /@media\(max-width:360px\)\{[\s\S]*?html,[\s\S]*?body\{[\s\S]*?min-width:0 !important;/u);
 assert.match(styles.slice(mobileHide), /@media\(max-width:420px\)\{[\s\S]*?\.gp-lav-active-job:not\(\[hidden\]\) ~ \.gp-lav-top-slot\{[\s\S]*?display:none !important;/u);
});
