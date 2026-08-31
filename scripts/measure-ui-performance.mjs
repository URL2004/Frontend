import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

function readArg(name, fallback) {
  const prefix = `--${name}=`;
  const found = process.argv.find(value => value.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function percentile(values, ratio) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1))];
}

const baseUrl = readArg('base', 'https://gpkorea.ai.kr').replace(/\/$/u, '');
const label = readArg('label', 'measurement').replace(/[^a-z0-9_-]/giu, '-');
const iterations = Math.max(1, Math.min(10, Number(readArg('runs', '3')) || 3));
const outputDir = path.resolve(
  readArg('out', path.join('..', '문서', '01_운영-배포-비즈니스', 'assets', 'ui-hardening-2026-08-30'))
);
const targets = [
  { name: 'landing-mobile', route: '/?lp=1', viewport: { width: 390, height: 844 } },
  { name: 'app-mobile', route: '/?lp=0', viewport: { width: 390, height: 844 } }
];

await fs.mkdir(outputDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const report = { schemaVersion: 1, label, baseUrl, iterations, measuredAt: new Date().toISOString(), targets: {} };

try {
  for (const target of targets) {
    const runs = [];
    for (let index = 0; index < iterations; index += 1) {
      const context = await browser.newContext({ viewport: target.viewport, locale: 'ko-KR', colorScheme: 'light' });
      const page = await context.newPage();
      const started = performance.now();
      await page.goto(`${baseUrl}${target.route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      const domContentLoadedMs = performance.now() - started;
      await page.waitForFunction(() => document.documentElement.classList.contains('design-ready'), null, { timeout: 15_000 });
      const designReadyMs = performance.now() - started;
      await page.waitForTimeout(400);
      const browserMetrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const fcp = performance.getEntriesByName('first-contentful-paint')[0];
        const resources = performance.getEntriesByType('resource');
        return {
          domInteractiveMs: Math.round(navigation && navigation.domInteractive || 0),
          loadEventMs: Math.round(navigation && navigation.loadEventEnd || 0),
          firstContentfulPaintMs: Math.round(fcp && fcp.startTime || 0),
          resourceCount: resources.length,
          transferBytes: Math.round(resources.reduce((sum, item) => sum + (item.transferSize || 0), 0))
        };
      });
      runs.push({
        domContentLoadedMs: Math.round(domContentLoadedMs),
        designReadyMs: Math.round(designReadyMs),
        ...browserMetrics
      });
      await context.close();
    }
    const designTimes = runs.map(run => run.designReadyMs);
    report.targets[target.name] = {
      runs,
      medianDesignReadyMs: percentile(designTimes, 0.5),
      p95DesignReadyMs: percentile(designTimes, 0.95)
    };
  }
} finally {
  await browser.close();
}

const output = path.join(outputDir, `${label}-performance.json`);
await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${output}\n${JSON.stringify(report.targets, null, 2)}\n`);
