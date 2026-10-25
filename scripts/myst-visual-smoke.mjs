// Chromium-only visual QA in an isolated, mocked Telegram session.
// All /api calls are intercepted in the test: no balance/transaction mutation.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';

const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
const artifacts = 'artifacts/myst-smoke';
await fs.mkdir(artifacts, { recursive: true });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

for (let i = 0; i < 75; i++) {
  try { const response = await fetch(base+'/webapp'); if (response.ok) break; } catch {}
  if (i === 74) throw new Error('Dev server not reachable');
  await delay(400);
}

const data = {
  ok: true, user: { id: 24680, balance: 150, is_banned: false },
  telegramUser: { id: 24680, first_name: 'Test', last_name: 'Account' },
  isAdmin: false,
  cases: [{ id: 'case-test', title: 'Demo case', description: 'Preview', price: 0, image_url: '/cases/starter.svg', is_active: true, sort_order: 0 }],
  gifts: [], inventoryGifts: [], history: [], withdrawals: [], upgradeRounds: [], featureSettings: {},
};
const telegramScript = `window.Telegram={WebApp:{initData:'mocked-session',initDataUnsafe:{user:{id:24680,first_name:'Test',last_name:'Account'}},ready(){},expand(){},MainButton:{hide(){}},BackButton:{hide(){}},HapticFeedback:{notificationOccurred(){},impactOccurred(){}},platform:'android',version:'8.0'}};`;
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
for (const viewport of [
  { name: 'iphone-size', width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'short-mobile', width: 375, height: 667, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: 'desktop', width: 1280, height: 800, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
]) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.deviceScaleFactor,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
  });
  await context.addInitScript(() => {
    window.__mystPerf = { lcp: 0, cls: 0, longTasks: 0 };
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) window.__mystPerf.lcp = Math.round(e.startTime);
      }).observe({ type: 'largest-contentful-paint', buffered: true });
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (!e.hadRecentInput) window.__mystPerf.cls += e.value;
        }
      }).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver((list) => {
        window.__mystPerf.longTasks += list.getEntries().length;
      }).observe({ type: 'longtask', buffered: true });
    } catch {}
  });
  await context.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript', body: telegramScript,
  }));
  if (viewport.name === 'short-mobile') {
    await context.route('**/cases/starter.svg', (route) => route.abort());
    await context.route('**/feature/game-banners/pvp-v41.webp', async (route) => {
      await delay(1600);
      await route.continue();
    });
  }
  await context.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname === '/api/bootstrap') await delay(190);
    const value = pathname === '/api/bootstrap' ? data : { ok: true };
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(value) });
  });
  const page = await context.newPage();
  const warnings = [];
  page.on('pageerror', (error) => warnings.push(String(error)));
  await page.goto(base+'/webapp', { waitUntil: 'domcontentloaded' });
  await page.getByRole('main', { name: 'MYST tanishtiruv' }).waitFor({ state: 'visible', timeout: 16000 });
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('.app-frame').count(), 0, 'Home must not render behind onboarding');
  assert.equal(await page.getByRole('navigation', { name: 'Bottom navigation' }).count(), 0);
  const introBounds = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
    height: document.querySelector('[data-myst-intro]')?.getBoundingClientRect().height,
  }));
  assert.ok(introBounds.scroll <= viewport.width + 2, 'Onboarding must have no horizontal overflow');
  assert.ok(introBounds.height >= viewport.height - 1, 'Onboarding must fill screen');
  await page.screenshot({ path: `${artifacts}/${viewport.name}-welcome.png`, fullPage: true });
  if (viewport.name === 'iphone-size') {
    await page.getByRole('button', { name: 'Keyingisi' }).click();
    await page.getByRole('heading', { name: /Caselarni oching/ }).waitFor();
    await page.screenshot({ path: `${artifacts}/${viewport.name}-step2.png`, fullPage: true });
    await page.getByRole('button', { name: 'Keyingisi' }).click();
    await page.getByRole('heading', { name: /Inventaringizni/ }).waitFor();
    await page.getByRole('button', { name: 'Boshlash' }).click();
  } else {
    await page.getByRole('button', { name: /Tanishtiruvni o‘tkazib yuborish/ }).click();
  }
  await page.getByRole('heading', { name: 'Play. Win. Repeat.' }).waitFor({ timeout: 9000 });
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
    background: getComputedStyle(document.body).backgroundColor,
    images: [...document.querySelectorAll('img')].length,
  }));
  assert.ok(width.viewport <= viewport.width + 1, `Incorrect mobile viewport: expected ${viewport.width}, got ${width.viewport}`);
  assert.ok(width.scroll <= width.viewport + 2, `Horizontal overflow on ${viewport.name}: ${JSON.stringify(width)}`);
  assert.notEqual(width.background, 'rgb(255, 255, 255)', 'White background must not flash');
  await page.screenshot({ path: `${artifacts}/${viewport.name}-home.png`, fullPage: true });

  // Fixed viewport controls must remain at identical screen coordinates while
  // the CONTENT moves. The test-only spacer guarantees a meaningful scroll,
  // even when the mocked account has very little content.
  const dockFixed = await page.evaluate(async () => {
    const header = document.querySelector('.global-balance-stabilizer');
    const dock = document.querySelector('nav[aria-label="Bottom navigation"]');
    const main = document.querySelector('.app-main');
    if (!header || !dock || !main) throw new Error('Persistent shell controls missing');
    const spacer = document.createElement('div');
    spacer.style.height = '1500px';
    spacer.setAttribute('data-test-spacer', 'true');
    main.appendChild(spacer);

    const measure = () => ({
      headerY: header.getBoundingClientRect().top,
      dockY: dock.getBoundingClientRect().top,
      headerPosition: getComputedStyle(header).position,
      dockPosition: getComputedStyle(dock).position,
      frameTransform: getComputedStyle(document.querySelector('.app-frame')).transform,
      scrollY: window.scrollY,
    });
    const first = measure();
    window.scrollTo({ top: 520, left: 0, behavior: 'instant' });
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const second = measure();
    return { first, second };
  });
  assert.ok(dockFixed.second.scrollY - dockFixed.first.scrollY > 150,
    `Document must scroll for fixed-position test: ${JSON.stringify(dockFixed)}`);
  assert.equal(dockFixed.first.headerPosition, 'fixed');
  assert.equal(dockFixed.first.dockPosition, 'fixed');
  assert.equal(dockFixed.first.frameTransform, 'none', 'App frame must not trap fixed-position children');
  assert.ok(Math.abs(dockFixed.second.headerY - dockFixed.first.headerY) <= 1.5,
    `Top balance moved during scroll: ${JSON.stringify(dockFixed)}`);
  assert.ok(Math.abs(dockFixed.second.dockY - dockFixed.first.dockY) <= 1.5,
    `Bottom dock moved during scroll: ${JSON.stringify(dockFixed)}`);
  await page.screenshot({ path: `${artifacts}/${viewport.name}-pinned-bars.png`, fullPage: false });
  await page.evaluate(() => {
    document.querySelector('[data-test-spacer]')?.remove();
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  });
  await delay(300);
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return {
      domContentLoaded: Math.round(n?.domContentLoadedEventEnd || 0),
      load: Math.round(n?.loadEventEnd || 0),
      resourceCount: performance.getEntriesByType('resource').length,
      lcp: window.__mystPerf?.lcp || 0,
      cls: Number((window.__mystPerf?.cls || 0).toFixed(4)),
      longTasks: window.__mystPerf?.longTasks || 0,
    };
  });
  assert.deepEqual(warnings, [], `Page errors on ${viewport.name}`);
  results.push({ viewport: viewport.name, width, timings: nav, pageErrors: warnings.length });
  if (viewport.name === 'short-mobile') {
    await page.getByRole('button', { name: 'Case rasmini qayta yuklash' }).waitFor({ timeout: 6000 });
    await page.screenshot({ path: `${artifacts}/short-mobile-broken-image.png`, fullPage: true });
  }
  if (viewport.name === 'iphone-size') {
    // An actual route change must use a small local skeleton, never a full-screen boot.
    await page.getByRole('button', { name: /UPGRADE/ }).first().click();
    await page.getByRole('img', { name: /Upgrade barabani/ }).waitFor({ timeout: 10000 });
    assert.equal(await page.getByRole('status', { name: 'MYST yuklanmoqda' }).count(), 0);
    await page.getByRole('button', { name: 'Orqaga' }).click();
    await page.getByRole('heading', { name: 'Play. Win. Repeat.' }).waitFor({ timeout: 8000 });
    await page.reload({ waitUntil: 'domcontentloaded' });
      await page.getByRole('main', { name: 'MYST tanishtiruv' }).waitFor({ state: 'visible', timeout: 16000 });
    await page.getByRole('button', { name: /Tanishtiruvni o‘tkazib yuborish/ }).click();
    await page.getByRole('heading', { name: 'Play. Win. Repeat.' }).waitFor();
  }
  await context.close();
}
await browser.close();
await fs.writeFile(`${artifacts}/measurements.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
