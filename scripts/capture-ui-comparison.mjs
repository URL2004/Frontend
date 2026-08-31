import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

const baseUrl = readArg('base', 'https://gpkorea.ai.kr').replace(/\/$/u, '');
const label = readArg('label', 'after').replace(/[^a-z0-9_-]/giu, '-');
const outputDir = path.resolve(
  readArg('out', path.join('..', '문서', '01_운영-배포-비즈니스', 'assets', 'ui-hardening-2026-08-30'))
);
const targets = [
  ['landing-desktop', '/?lp=1', { width: 1440, height: 900 }],
  ['landing-mobile', '/?lp=1', { width: 390, height: 844 }],
  ['app-mobile', '/?lp=0', { width: 390, height: 844 }],
  ['pricing-desktop', '/pricing', { width: 1440, height: 900 }],
  ['pricing-mobile', '/pricing', { width: 390, height: 844 }],
  ['notice-desktop', '/notice', { width: 1440, height: 900 }],
  ['qna-mobile', '/qna', { width: 390, height: 844 }],
  ['guide-desktop', '/guide', { width: 1440, height: 900 }],
  ['writing-lab-mobile', '/writing-lab', { width: 390, height: 844 }]
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });

try {
  for (const [name, route, viewport] of targets) {
    const context = await browser.newContext({ viewport, locale: 'ko-KR', colorScheme: 'light', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForFunction(() => document.documentElement.classList.contains('design-ready'), null, { timeout: 15_000 });
    await page.waitForTimeout(1_200);
    const file = path.join(outputDir, `${label}-${name}.png`);
    await page.screenshot({ path: file, fullPage: true });
    process.stdout.write(`${file}\n`);
    await context.close();
  }
} finally {
  await browser.close();
}
