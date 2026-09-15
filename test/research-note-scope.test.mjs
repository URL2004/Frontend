import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

test('scope research note uses explicit examples, valid links and no unverified performance claims', () => {
  const article = BLOG_ARTICLES.find(a => a.slug === 'negation-conditions-and-scope');
  assert.ok(article);
  assert.equal(article.date, '2026-09-15');
  assert.match(article.lead, /예시/);
  assert.match(article.body, /조건을 보존한 수정/);
  assert.match(article.body, /부정하는 대상/);
  assert.match(article.body, /일부인가요, 전체인가요/);
  assert.match(article.body, /사실 검증이나 AI 작성 여부의 판단을 대신할 수는 없어요/);
  for (const slug of article.related) assert.ok(BLOG_ARTICLES.some(a => a.slug === slug), slug);
  for (const [, slug] of article.body.matchAll(/href="\/blog\/([^"#]+)"/g)) {
    assert.ok(BLOG_ARTICLES.some(a => a.slug === slug), slug);
  }
  assert.equal(BLOG_ARTICLES.filter(a => a.slug === article.slug).length, 1);
});
