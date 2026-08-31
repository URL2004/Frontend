import { test, expect } from 'playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function isolateThirdParties(page) {
  await page.route(/(googletagmanager|google-analytics|connect\.facebook|wcs\.naver|fonts\.googleapis|fonts\.gstatic|cdn\.jsdelivr)/u, route => route.abort());
  await page.route('**/public/metrics', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ verified: false, since: null, processedCharacters: 0, completedJobs: 0 })
  }));
}

async function waitUntilReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('design-ready'));
  await expect(page.locator('#page-root')).toBeVisible();
}

test.describe('핵심 공개 화면 브라우저 회귀', () => {
  test.beforeEach(async ({ page }) => {
    await isolateThirdParties(page);
  });

  for (const entry of [
    { name: '랜딩', path: '/?lp=1', root: '#landingScreen' },
    { name: '공개 요금', path: '/pricing', root: '.gp-public-shell' },
    { name: '메인 작업실', path: '/?lp=0', root: '#appScreen' }
  ]) {
    test(`${entry.name}: 심각한 접근성 위반과 가로 넘침이 없다`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.goto(entry.path, { waitUntil: 'domcontentloaded' });
      await waitUntilReady(page);
      await expect(page.locator(entry.root)).toBeVisible();

      const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth));
      expect(overflow).toBeLessThanOrEqual(1);

      const result = await new AxeBuilder({ page }).include(entry.root).analyze();
      const severe = result.violations.filter(item => item.impact === 'serious' || item.impact === 'critical');
      expect(severe, JSON.stringify(severe, null, 2)).toEqual([]);
      expect(pageErrors).toEqual([]);
    });
  }

  test('랜딩: 서비스 탭은 방향키로 이동하고 연결된 패널을 갱신한다', async ({ page }) => {
    await page.goto('/?lp=1', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    await page.keyboard.press('Tab');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(4);
    await tabs.nth(0).focus();
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toBeFocused();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    const panelId = await tabs.nth(1).getAttribute('aria-controls');
    expect(panelId).toBeTruthy();
    await expect(page.locator(`#${panelId}`)).toBeVisible();
  });

  test('랜딩: 검증되지 않은 누적 지표는 노출하지 않는다', async ({ page }) => {
    await page.goto('/?lp=1', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    await expect(page.locator('#lpVerifiedMetrics')).toBeHidden();
  });

  test('메인: 외부 폰트를 차단해도 부팅과 입력이 가능하다', async ({ page }) => {
    await page.goto('/?lp=0', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    const input = page.locator('#lavInput');
    await expect(input).toBeVisible();
    await input.fill('브라우저 회귀 검사를 위한 안전한 입력 문장입니다.');
    await expect(input).toHaveValue(/브라우저 회귀 검사/u);
  });

  test('모바일: 주요 실행 버튼은 44px 이상의 터치 높이를 가진다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?lp=1', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    for (const selector of ['.gp-lp-nav-actions .gp-lp-primary', '.gp-lp-hero-cta .gp-lp-primary', '.gp-lp-hero-cta .gp-lp-ghost']) {
      const box = await page.locator(selector).boundingBox();
      expect(box, `${selector}가 보여야 한다`).toBeTruthy();
      expect(box.height, `${selector} 터치 높이`).toBeGreaterThanOrEqual(44);
    }
  });

  test('전체 화면 행렬: 320·375·768·1440px에서 문서 넘침과 깨진 정적 이미지가 없다', async ({ page }) => {
    test.setTimeout(120_000);
    const routes = [
      '/?lp=1', '/?lp=0', '/pricing', '/faq', '/notice', '/qna', '/guide',
      '/detect-report', '/history', '/mypage', '/admin', '/writing-lab',
      '/blog', '/carousel-lab.html'
    ];
    const viewports = [
      { width: 320, height: 720 },
      { width: 375, height: 812 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 }
    ];
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (await page.locator('#page-root').count()) await waitUntilReady(page);
        await page.waitForTimeout(120);
        const state = await page.evaluate(() => ({
          overflow: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          brokenImages: Array.from(document.images).filter(image => image.complete && image.currentSrc && image.naturalWidth === 0).map(image => image.currentSrc),
          mainCount: document.querySelectorAll('main').length
        }));
        expect(state.overflow, `${route} @ ${viewport.width}px`).toBeLessThanOrEqual(1);
        expect(state.brokenImages, `${route} @ ${viewport.width}px`).toEqual([]);
        expect(state.mainCount, `${route} @ ${viewport.width}px main landmark`).toBeLessThanOrEqual(1);
      }
    }
  });

  test('랜딩 무료 시작은 중간에 멈추지 않고 로그인 화면으로 전환한다', async ({ page }) => {
    await page.goto('/?lp=1', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    await page.getByRole('button', { name: '무료 10크레딧으로 시작하기' }).click();
    await expect(page.locator('#loginScreen')).toHaveClass(/active/u);
    await expect(page.getByRole('button', { name: /Google/u })).toBeVisible();
    await expect(page.getByRole('button', { name: /카카오/u })).toBeVisible();
  });

  test('핵심 앱 자산 실패는 작동하지 않는 화면 대신 재시도 안내를 보여준다', async ({ page }) => {
    await page.route(/\/assets\/js\/app-module(?:\.[a-f0-9]+)?\.js(?:\?|$)/u, route => route.abort());
    await page.goto('/?lp=0', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: '화면을 불러오지 못했어요' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
  });

  test('폐쇄 커뮤니티 URL은 실제 게시판을 노출하지 않고 메인 안내로 이동한다', async ({ page }) => {
    await page.goto('/community', { waitUntil: 'domcontentloaded' });
    await waitUntilReady(page);
    await expect(page).not.toHaveURL(/\/community(?:[/?#]|$)/u);
    await expect(page).toHaveURL(/mode=humanize/u);
    await expect(page.locator('#communityContent')).toHaveCount(0);
  });
});
