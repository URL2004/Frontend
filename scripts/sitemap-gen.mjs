// sitemap.xml 생성기(2026-08-28 T2.8) — 수기 사이트맵(lastmod 6월 고정)을 대체한다.
// 공개 라우트(route-meta.mjs)만 싣고, lastmod는 각 파셜의 실제 마지막 커밋일에서 얻는다.
// noindex 경로(/mypage·/admin·/pro·/writing-lab 등)는 ROUTES에 없으므로 자연히 제외된다.

import { execSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { SITE, ROUTES } from './route-meta.mjs';

const CHANGEFREQ = {
  '/': 'weekly', '/pricing': 'weekly', '/detect-report': 'weekly', '/blog': 'weekly',
  '/faq': 'monthly', '/guide': 'monthly', '/community': 'daily', '/qna': 'weekly', '/notice': 'weekly'
};
const PRIORITY = {
  '/': '1.0', '/detect-report': '0.9', '/pricing': '0.8', '/blog': '0.8',
  '/faq': '0.7', '/guide': '0.7', '/community': '0.7', '/qna': '0.6', '/notice': '0.6'
};

function lastmodFor(root, partial) {
  try {
    const iso = execSync(`git log -1 --format=%cI -- "pages/${partial}"`, { cwd: root, encoding: 'utf8' }).trim();
    if (iso) return iso.slice(0, 10);
  } catch { /* git 미사용 환경(CI 아카이브 등) → 오늘 날짜 폴백 */ }
  return new Date().toISOString().slice(0, 10);
}

export async function generateSitemap({ root, dist }) {
  const entries = ROUTES.map((r) => [
    '  <url>',
    `    <loc>${SITE}${r.url === '/' ? '/' : r.url}</loc>`,
    `    <lastmod>${lastmodFor(root, r.partial)}</lastmod>`,
    `    <changefreq>${CHANGEFREQ[r.url] || 'weekly'}</changefreq>`,
    `    <priority>${PRIORITY[r.url] || '0.5'}</priority>`,
    '  </url>'
  ].join('\n')).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
  await fs.writeFile(path.join(dist, 'sitemap.xml'), xml, 'utf8');
  return ROUTES.length;
}
