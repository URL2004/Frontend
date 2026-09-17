import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

for (const slug of ['paraphrasing-vs-summary-citation', 'verify-ai-generated-references']) {
  test(`${slug}: sourced, distinct, crawlable article content`, () => {
    const a = BLOG_ARTICLES.find(a => a.slug === slug);
    assert.ok(a);
    assert.equal(a.date, '2026-09-17');
    assert.ok(a.body.length > 2000);
    assert.match(a.body, /<caption>/);
    assert.match(a.body, /자주 묻는 질문/);
    assert.match(a.body, /설명(?:을 위해|하기 위해)/);
    assert.match(a.body, /https:\/\//);
    assert.match(a.body, /확인일: 2026-09-17/);
    for (const [, target] of a.body.matchAll(/href="\/blog\/([^"#]+)"/g)) {
      assert.ok(BLOG_ARTICLES.some(b => b.slug === target), target);
    }
    for (const target of a.related) assert.ok(BLOG_ARTICLES.some(b => b.slug === target));
  });
}
test('new notes distinguish provenance from expression or an identifier', () => {
  const para = BLOG_ARTICLES.find(a => a.slug === 'paraphrasing-vs-summary-citation');
  const refs = BLOG_ARTICLES.find(a => a.slug === 'verify-ai-generated-references');
  assert.match(para.body, /표현을 바꿨어도 출처/);
  assert.match(refs.body, /정확성을 보증하는 인증서가 아니/);
  assert.match(refs.body, /존재하지 않는다고 단정하지/);
  assert.match(refs.body, /초록만 읽고/);
});
