import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

test('mixed-purpose writing note separates paragraph roles without flattening voice', () => {
  const article = BLOG_ARTICLES.find(item => item.slug === 'mixed-purpose-writing-tone-guide');
  assert.ok(article);
  assert.equal(article.date, '2026-09-22');
  assert.equal(article.reviewer, '편집 검토 완료');
  assert.ok(article.body.length > 3000);
  assert.match(article.body, /배경·수행·관찰·해석·성찰·계획/);
  assert.match(article.body, /모든 문장에 ‘저는’을 넣으면/);
  assert.match(article.body, /계획이 이미 수행한 결과처럼/);
  assert.match(article.body, /실제 이용자 글이나 실제 연구 결과를 옮긴 것이 아니/);
  assert.match(article.body, /<caption>/);
  for (const target of article.related) {
    assert.ok(BLOG_ARTICLES.some(item => item.slug === target), target);
  }
  for (const [, target] of article.body.matchAll(/href="\/blog\/([^"#]+)"/g)) {
    assert.ok(BLOG_ARTICLES.some(item => item.slug === target), target);
  }
  assert.equal(BLOG_ARTICLES.filter(item => item.slug === article.slug).length, 1);
});
