import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

test('reading response note distinguishes plot, interpretation and invented examples', () => {
  const article = BLOG_ARTICLES.find(a => a.slug === 'reading-response-summary-vs-interpretation');
  assert.ok(article);
  assert.equal(article.date, '2026-09-22');
  assert.match(article.lead, /줄거리/);
  assert.match(article.body, /가상의 이야기와 예문/);
  assert.match(article.body, /작품의 서술과 나의 해석/);
  assert.match(article.body, /학교·과목에서/);
  assert.ok(article.body.length > 2500);
  for (const slug of article.related) assert.ok(BLOG_ARTICLES.some(a => a.slug === slug), slug);
  for (const [, slug] of article.body.matchAll(/href="\/blog\/([^"#]+)"/g)) {
    assert.ok(BLOG_ARTICLES.some(a => a.slug === slug), slug);
  }
  assert.equal(BLOG_ARTICLES.filter(a => a.slug === article.slug).length, 1);
});
