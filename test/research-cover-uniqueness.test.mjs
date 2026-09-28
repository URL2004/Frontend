import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { BLOG_ARTICLES } from '../scripts/blog-data.mjs';

test('연구노트별 커버는 파일명만 바꾼 동일 이미지가 아니어야 한다', async () => {
  const seen = new Map();
  for (const { slug } of BLOG_ARTICLES) {
    const bytes = await readFile(new URL(`../assets/img/blog/${slug}.webp`, import.meta.url));
    const digest = createHash('sha256').update(bytes).digest('hex');
    assert.ok(!seen.has(digest), `${slug} 커버가 ${seen.get(digest)}와 동일함: 글에 맞는 개별 커버가 필요함`);
    seen.set(digest, slug);
  }
  assert.equal(seen.size, BLOG_ARTICLES.length);
});
