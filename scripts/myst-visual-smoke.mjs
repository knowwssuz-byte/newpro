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
  const context = await browser.newContext(viewport);
  await context.route('https://telegram.org/js/telegram-web-app.js', (route) => route.fulfill({
    status: 200, contentType: 'application/javascript', body: telegramScript,
  }));
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
  await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 16000 });
  await page.screenshot({ path: `${artifacts}/${viewport.name}-welcome.png`, fullPage: true });
  await page.getByRole('button', { name: /Tanishtiruvni o‘tkazib yuborish/ }).click();
  await page.getByRole('heading', { name: 'Play. Win. Repeat.' }).waitFor({ timeout: 9000 });
  const width = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth, viewport: window.innerWidth,
    background: getComputedStyle(document.body).backgroundColor,
    images: [...document.querySelectorAll('img')].length,
  }));
  assert.ok(width.scroll <= width.viewport + 2, `Horizontal overflow on ${viewport.name}: ${JSON.stringify(width)}`);
  await page.screenshot({ path: `${artifacts}/${viewport.name}-home.png`, fullPage: true });
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    return { domContentLoaded: Math.round(n?.domContentLoadedEventEnd || 0), load: Math.round(n?.loadEventEnd || 0), resourceCount: performance.getEntriesByType('resource').length };
  });
  assert.deepEqual(warnings, [], `Page errors on ${viewport.name}`);
  results.push({ viewport: viewport.name, width, timings: nav, pageErrors: warnings.length });
  if (viewport.name === 'iphone-size') {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('dialog').first().waitFor({ state: 'visible', timeout: 16000 });
    await page.getByRole('button', { name: /Tanishtiruvni o‘tkazib yuborish/ }).click();
    await page.getByRole('heading', { name: 'Play. Win. Repeat.' }).waitFor();
  }
  await context.close();
}
await browser.close();
await fs.writeFile(`${artifacts}/measurements.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
