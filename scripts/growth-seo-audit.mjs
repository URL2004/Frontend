import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const FIXED_QUERIES = ['ai 검사기', 'ai검사기', 'ai 판독기', 'ai판독기', 'ai 탐지기', 'ai탐지기'];
export const INDEX_TARGETS = [
  '/blog/career-writing-role-and-evidence', '/blog/humanizing-before-after-review',
  '/blog/negation-conditions-and-scope', '/blog/paraphrasing-vs-summary-citation',
  '/blog/quotation-particles-and-context', '/blog/repeated-conclusions-revision',
  '/blog/research-plan-versus-results', '/blog/verify-ai-generated-references',
  '/templates/general/email', '/templates/resume/collaboration'
];
function normalize(value) { return value.replace(/\/$/, '') || '/'; }
function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map(x => [x[1].toLowerCase(), x[2]]));
}
export function inspectHtml(html, url, status = 200, robotsHeader = '') {
  const tags = [...html.matchAll(/<(?:link|meta)\b[^>]*>/gi)].map(x => attributes(x[0]));
  const canonical = tags.find(x => x.rel === 'canonical')?.href || '';
  const robots = [robotsHeader, ...tags.filter(x => ['robots', 'googlebot'].includes(x.name)).map(x => x.content)].join(' ');
  const text = html.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const links = [...html.matchAll(/<a\b[^>]*>/gi)].map(x => attributes(x[0]).href).filter(Boolean).flatMap(href => {
    try { const link = new URL(href, url); return link.origin === new URL(url).origin ? [normalize(link.pathname)] : []; } catch { return []; }
  });
  return { status, canonical, selfCanonical: normalize(canonical) === normalize(url), noindex: /\bnoindex\b/i.test(robots),
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '',
    h1Count: [...html.matchAll(/<h1\b/gi)].length, bodyCharacters: text.length, links: [...new Set(links)] };
}
export async function audit(base = 'https://gpkorea.ai.kr') {
  const origin = new URL(base).origin;
  const sitemapResponse = await fetch(origin + '/sitemap.xml');
  if (!sitemapResponse.ok) throw new Error('sitemap HTTP ' + sitemapResponse.status);
  const sitemap = await sitemapResponse.text();
  const paths = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(x => normalize(new URL(x[1]).pathname)))];
  const allPaths = [...new Set([...paths, ...INDEX_TARGETS])];
  const pages = {};
  for (let i = 0; i < allPaths.length; i += 5) await Promise.all(allPaths.slice(i, i + 5).map(async p => {
    const response = await fetch(origin + p, { signal: AbortSignal.timeout(20000) });
    pages[p] = inspectHtml(await response.text(), origin + p, response.status, response.headers.get('x-robots-tag') || '');
  }));
  const targets = INDEX_TARGETS.map(p => ({ path: p, ...pages[p], inSitemap: paths.includes(p),
    inbound: Object.entries(pages).filter(([from, page]) => from !== p && page.links.includes(p)).map(([from]) => from),
    indexStatus: 'requires_search_console', nextCheck: 'deployment + 7 days' }));
  return { capturedAt: new Date().toISOString(), base: origin, sitemapCount: paths.length, fixedQueries: FIXED_QUERIES, targets,
    failures: targets.filter(x => x.status !== 200 || !x.selfCanonical || x.noindex || x.h1Count !== 1 || !x.inSitemap || !x.inbound.length).map(x => x.path) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = Object.fromEntries(process.argv.slice(2).map(x => x.replace(/^--/, '').split('=')));
  const report = await audit(args.base);
  if (args.out) await fs.writeFile(args.out, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ sitemapCount: report.sitemapCount, targets: report.targets.length, failures: report.failures }));
  if (report.failures.length) process.exitCode = 1;
}
