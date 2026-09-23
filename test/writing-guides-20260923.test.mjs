import test from 'node:test';
import assert from 'node:assert/strict';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

for (const slug of ['professor-email-subject-and-examples', 'report-introduction-conclusion-examples']) {
  test(`${slug}: complete, linked and reviewed writing guide`, () => {
    const matches = BLOG_ARTICLES.filter(a => a.slug === slug);
    assert.equal(matches.length, 1);
    const article = matches[0];
    assert.equal(article.date, '2026-09-23');
    assert.equal(article.reviewer, '편집 검토 완료');
    assert.ok(article.body.length > 2500);
    assert.match(article.body, /가상 예문/);
    assert.match(article.body, /수업/);
    assert.ok((article.body.match(/<h2>/g) || []).length >= 6);
    for (const related of article.related) assert.ok(BLOG_ARTICLES.some(a => a.slug === related), related);
    for (const [, target] of article.body.matchAll(/href="\/blog\/([^"#]+)"/g)) {
      assert.ok(BLOG_ARTICLES.some(a => a.slug === target), target);
    }
  });
}
test('email examples preserve actual circumstances and privacy boundaries', () => {
  const { body } = BLOG_ARTICLES.find(a => a.slug === 'professor-email-subject-and-examples');
  assert.match(body, /답변이나 요청 승인을 보장하지/);
  assert.match(body, /허위 질병/);
  assert.match(body, /주민등록번호/);
  assert.match(body, /owl\.purdue\.edu/);
});
test('report examples distinguish proposed structure from actual findings', () => {
  const { body } = BLOG_ARTICLES.find(a => a.slug === 'report-introduction-conclusion-examples');
  assert.match(body, /실제 연구 결과가 아니며/);
  assert.match(body, /고정 비율이나 줄 수는 없어요/);
  assert.match(body, /그 논의를 하지 않았다면/);
  assert.match(body, /writingcenter\.fas\.harvard\.edu\/introductions/);
  assert.match(body, /writingcenter\.fas\.harvard\.edu\/conclusions/);
});
