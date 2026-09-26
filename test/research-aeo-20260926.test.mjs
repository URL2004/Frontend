import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';
import { generateContentPages, contentUrls } from '../scripts/content-pages.mjs';

const slugs = ['abstract-vs-introduction-writing-guide', 'research-question-narrowing-examples'];
for (const slug of slugs) {
  test(`${slug}: sourced, self-contained writing guidance without invented research`, () => {
    const article = BLOG_ARTICLES.find(a => a.slug === slug);
    assert.ok(article);
    assert.equal(BLOG_ARTICLES.filter(a => a.slug === slug).length, 1);
    assert.equal(article.date, '2026-09-26');
    assert.equal(article.reviewer, '편집 검토 완료');
    assert.ok(article.body.length > 2500);
    assert.ok(existsSync(new URL(`../assets/img/blog/${slug}.webp`, import.meta.url)));
    assert.match(article.lead, /<b>.+<\/b>/);
    assert.match(article.body, /가상 예시/);
    assert.match(article.body, /자주 묻는 질문/);
    assert.match(article.body, /<caption>/);
    assert.match(article.body, /scope="col"/);
    assert.match(article.body, /scope="row"/);
    assert.match(article.body, /href="https:\/\/(?:www\.unr\.edu|writingcenter\.gmu\.edu)\//);
    assert.doesNotMatch(article.body, /인용률|상위 노출 보장|실제 이용자 \d+명|정확도 100%/);
    for (const related of [...article.related, ...Array.from(article.body.matchAll(/href="\/blog\/([^"#]+)"/g), m => m[1])]) {
      assert.ok(BLOG_ARTICLES.some(a => a.slug === related), related);
    }
  });
}

test('new notes render complete indexable articles and enter hub, metadata and sitemap inputs', async () => {
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'gp-aeo-notes-'));
  try {
    await generateContentPages({ dist: tmp });
    const hub = await readFile(path.join(tmp, 'blog/index.html'), 'utf8');
    for (const slug of slugs) {
      const article = BLOG_ARTICLES.find(a => a.slug === slug);
      const html = await readFile(path.join(tmp, 'blog', slug, 'index.html'), 'utf8');
      assert.ok(hub.includes(`/blog/${slug}`));
      assert.ok(contentUrls().some(p => p.url === `/blog/${slug}` && p.date === article.date));
      assert.ok(html.includes(`<h1>${article.title}</h1>`));
      assert.ok(html.includes(article.body));
      assert.match(html, new RegExp(`<link rel="canonical" href="https://gpkorea.ai.kr/blog/${slug}"`));
      assert.doesNotMatch(html, /<meta[^>]+name="robots"[^>]+noindex/);
      const schemas = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1]));
      const metadata = schemas.find(s => s['@type'] === 'Article');
      assert.equal(metadata.headline, article.title);
      assert.equal(metadata.datePublished, article.date);
      assert.equal(metadata.author.name, '교수님 피하기 팀');
      assert.equal(metadata.mainEntityOfPage, `https://gpkorea.ai.kr/blog/${slug}`);
    }
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
