import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {BLOG_ARTICLES} from '../scripts/blog-data.mjs';
const slugs=['label-body-paragraph-guide','natural-revision-without-overwriting'];
for(const slug of slugs)test(`${slug}: complete editorial note, cover and internal links`,()=>{
 const article=BLOG_ARTICLES.find(a=>a.slug===slug);
 assert.ok(article);assert.equal(article.date,'2026-09-20');
 assert.equal(BLOG_ARTICLES.filter(a=>a.slug===slug).length,1);
 assert.ok(article.body.length>1500);assert.match(article.lead,/예시|예문/);
 assert.ok(existsSync(new URL(`../assets/img/blog/${slug}.webp`,import.meta.url)));
 for(const related of [...article.related,...Array.from(article.body.matchAll(/href="\/blog\/([^"#]+)"/g),m=>m[1])])assert.ok(BLOG_ARTICLES.some(a=>a.slug===related),related);
 assert.doesNotMatch(article.body,/양가람|전민우|원문.*100%|정확도.*100%/);
});
test('two recent notices are important without removing billing notices',()=>{
 const source=readFileSync(new URL('../assets/js/app-module.js',import.meta.url),'utf8');
 for(const id of ['humanize-paragraph-update-20260920','humanize-meaning-naturalness-20260920']) {
  const block=source.slice(source.indexOf(`id: '${id}'`)).split('\n },')[0];
  assert.match(block,/highlightLabel: '중요'/);assert.match(block,/date: '2026\.09\.20'/);assert.match(block,/고객센터/);
 }
 assert.match(source,/id: 'advanced-credit-steps-20260902'/);assert.match(source,/id: 'paid-credit-no-expiry-20260829'/);
});
test('patchnotes include every missing engine release and an accurate current version',()=>{
 const html=readFileSync(new URL('../pages/admin.html',import.meta.url),'utf8');
 for(let version=54;version<=63;version++)assert.ok(html.includes(`v2.5.${version}`));
 assert.match(html,/휴머나이징 v2\.5\.66 · AI 감지 v1\.41/);
 assert.match(html,/Backend 52048ae/);assert.match(html,/1,852개 테스트/);
 assert.match(html,/새 실모델 호출이나 전체 수동 의미 검수가 아닙니다/);
 assert.equal([...html.matchAll(/<details class="gp-admin-patch-release"/g)].length,83);
});
