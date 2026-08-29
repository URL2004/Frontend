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
 const styles = await read('assets/css/redesign.css');
 assert.match(styles, /\.ls-upgrade-btn\.gp-gradient-action,[\s\S]*?\.gp-invite-btn\.gp-gradient-action,[\s\S]*?\.gp-support-cta\.gp-gradient-action\{[\s\S]*?height:42px !important;[\s\S]*?border-radius:10px !important;[\s\S]*?linear-gradient\(144deg,#af40ff,#5b42f3 50%,#00ddeb\)/u);
 assert.match(styles, /\.ls-upgrade-btn\.gp-gradient-action\{\s*min-width:104px;/u);
 assert.match(styles, /\.gp-lav-top-right :is\(\.ls-credit-btn,\.ls-upgrade-btn\.gp-gradient-action\)\{\s*height:52px !important;\s*min-height:52px !important;/u);
 assert.match(styles, /@media\(max-width:760px\)\{[\s\S]*?\.gp-lav-mobile-pricing\{display:none !important;\}/u);
 assert.match(styles, /\.gp-invite-btn\.gp-gradient-action::before,[\s\S]*?\.gp-support-cta\.gp-gradient-action::before\{[\s\S]*?inset:3px;[\s\S]*?background:rgb\(5,6,45\)/u);
});
