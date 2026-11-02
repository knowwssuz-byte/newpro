// Full UI -> production API handler -> isolated PostgreSQL -> UI smoke suite.
// Every /api request is intercepted; no live balances or giveaways are touched.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { chromium, expect } from "@playwright/test";
import { createGiveawayDb } from "../tests/fixtures/giveaway-db.mjs";
import { giveawayHandlers } from "../tests/fixtures/giveaway-handlers.mjs";

const base = process.env.BASE_URL || "http://127.0.0.1:3100";
const out = "artifacts/giveaway";
await fs.mkdir(out, { recursive: true });
const server = process.env.BASE_URL
  ? null
  : spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        "3100",
      ],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
let serverLog = "";
server?.stdout.on("data", (chunk) => {
  serverLog += chunk;
});
server?.stderr.on("data", (chunk) => {
  serverLog += chunk;
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const asset = new URL(
  "../tests/fixtures/giveaway-media/gift.webp",
  import.meta.url,
);
const animation = JSON.parse(
  gunzipSync(
    await fs.readFile(
      new URL("../tests/fixtures/giveaway-media/gift.tgs", import.meta.url),
    ),
  ),
);
const libraryId = "a0000000-0000-4000-8000-000000000001";
const mediaUrl =
  "https://ylcipsfuojjvsqowbpol.supabase.co/storage/v1/object/public/gift-assets/telegram/unlimited/5170145012310081615/sticker-f2197a85-445c-4ee7-84a6-ff44e89dc8b2.tgs";
const library = [
  {
    id: libraryId,
    title: "Telegram Gift · 15 Stars",
    is_active: true,
    image_url: "/qa/gift.webp",
    animation_url: mediaUrl,
  },
];
const results = [];
let browser, currentPage;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/admin")).ok) break;
    } catch {}
    if (i === 99) throw Error("Server did not start: " + serverLog);
    await wait(300);
  }
  browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-dev-shm-usage",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  for (const width of [360, 390, 430, 1280]) {
    const db = await createGiveawayDb();
    const { publicPost, adminPost, adapter } = await giveawayHandlers(db);
    const rpc = async (name, params = {}) => {
      const result = await adapter.rpc(name, params);
      if (result.error) throw Error(result.error.message);
      return result.data;
    };
    await db.query(
      "insert into gift_library(id,title,image_url,animation_url) values($1,$2,$3,$4)",
      [libraryId, library[0].title, "/qa/gift.webp", mediaUrl],
    );
    await db.exec(
      "insert into users(id,first_name,balance) select n,'Ishtirokchi '||n,10000 from generate_series(1,65) n;",
    );
    const create = async (title, mode, price, live = true) => {
      const id = await rpc("newpro_giveaway_create", {
        p_title: title,
        p_description: "Har bir o‘rin uchun haqiqiy Telegram sovg‘asi.",
        p_mode: mode,
        p_entry_price: price,
        p_ends_at: new Date(Date.now() + 86400000).toISOString(),
        p_prize_ids: [libraryId, libraryId, libraryId],
      });
      if (live) {
        const { rows } = await db.query(
          "select updated_at::text as value from giveaways where id=$1",
          [id],
        );
        await rpc("newpro_giveaway_publish", {
          p_giveaway: id,
          p_expected_updated_at: rows[0].value,
        });
      }
      return id;
    };
    const primary = await create("Haftaning sovg‘asi", "weighted", 10);
    const free = await create("Bepul qatnashish", "equal", 0);
    const paid = await create("Maxsus sovrinlar", "equal", 25);
    const draft = await create("Yangi hafta sovrinlari", "weighted", 10, false);
    await rpc("newpro_giveaway_set_featured", {
      p_giveaway: primary,
      p_featured: true,
    });
    for (let user = 2; user <= 65; user++)
      await rpc("newpro_giveaway_join", {
        p_giveaway: primary,
        p_user: user,
        p_amount: 20,
        p_request: crypto.randomUUID(),
      });
    await rpc("newpro_giveaway_join", {
      p_giveaway: primary,
      p_user: 1,
      p_amount: 10,
      p_request: crypto.randomUUID(),
    });
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      deviceScaleFactor: 1,
      isMobile: width < 600,
      hasTouch: width < 600,
    });
    await context.addInitScript(() => {
      sessionStorage.setItem("gift_myst_admin_key", "isolated-qa-admin");
    });
    const telegram = `window.Telegram={WebApp:{initData:'isolated-qa-session',initDataUnsafe:{user:{id:1,first_name:'Test'}},ready(){},expand(){},MainButton:{hide(){}},BackButton:{hide(){},show(){},onClick(){},offClick(){}},HapticFeedback:{notificationOccurred(){},impactOccurred(){}},platform:'android',version:'8.0'}};`;
    await context.route(
      "https://telegram.org/js/telegram-web-app.js",
      (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: telegram,
        }),
    );
    await context.route("**/qa/gift.webp", (route) =>
      route.fulfill({ contentType: "image/webp", path: asset.pathname }),
    );
    let dropReply = false,
      animationFails = false;
    const joins = [],
      nativeDialogs = [],
      pageErrors = [];
    await context.route("**/api/**", async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname,
        body = req.postDataJSON() || {};
      if (path === "/api/gift-animation")
        return route.fulfill({
          status: animationFails ? 502 : 200,
          json: animationFails
            ? { ok: false }
            : { ok: true, animationData: animation },
        });
      if (
        path === "/api/giveaway" ||
        (path === "/api/browser-admin" &&
          String(body.action).startsWith("giveaway_"))
      ) {
        const handler = path === "/api/giveaway" ? publicPost : adminPost;
        const response = await handler(
          new Request(req.url(), {
            method: "POST",
            headers: req.headers(),
            body: req.postData(),
          }),
        );
        const json = await response.json();
        if (body.action === "join") {
          joins.push(body);
          if (dropReply) {
            dropReply = false;
            return route.abort("failed");
          }
        }
        return route.fulfill({ status: response.status, json });
      }
      const { rows } = await db.query(
        "select id,first_name,balance,is_banned from users where id=1",
      );
      return route.fulfill({
        json: {
          ok: true,
          showWelcomeTour: false,
          phase: body.phase || "full",
          user: rows[0],
          telegramUser: { id: 1, first_name: "Test" },
          cases: [],
          gifts: [],
          giftLibrary: library,
          history: [],
          inventoryGifts: [],
          upgradeCatalog: [],
          withdrawals: [],
          upgradeRounds: [],
          featureSettings: {},
        },
      });
    });
    const page = await context.newPage();
    currentPage = page;
    page.on("dialog", async (dialog) => {
      nativeDialogs.push(dialog.type());
      await dialog.dismiss();
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(base + "/webapp", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: /^GIVEAWAY,/ })
      .click({ timeout: 30000 });
    await expect(
      page.getByRole("heading", { name: "Haftaning sovg‘asi", exact: true }),
    ).toBeVisible();
    await page
      .locator('[data-playing="true"]')
      .first()
      .waitFor({ timeout: 15000 });
    const hero = page.locator('[class*="heroPrize"]').first();
    const heroBox = await hero.boundingBox();
    assert.ok(heroBox.width >= 180 && heroBox.height >= 180);
    await page.screenshot({ path: `${out}/user-${width}.png`, fullPage: true });
    assert.ok(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      `User overflow at ${width}`,
    );
    if (width === 430) {
      animationFails = true;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^GIVEAWAY,/ }).click();
      const fallbackHero = page.locator('[class*="heroPrize"]').first();
      await expect(fallbackHero.locator("img")).toBeVisible();
      await expect(fallbackHero).toHaveAttribute("data-playing", "false");
      assert.ok(
        await fallbackHero
          .locator("img")
          .evaluate((img) => img.naturalWidth > 0),
      );
      await page.screenshot({ path: `${out}/gift-fallback-430.png` });
      const beforeFallback = await fallbackHero.boundingBox();
      await db.query(
        "update giveaway_prizes set gift_image_url='/qa/missing.webp' where giveaway_id=$1",
        [primary],
      );
      await context.route("**/qa/missing.webp", (route) =>
        route.fulfill({ status: 404, body: "" }),
      );
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("button", { name: /^GIVEAWAY,/ }).click();
      await expect(fallbackHero.getByText("Rasm mavjud emas")).toBeVisible();
      const afterFallback = await fallbackHero.boundingBox();
      assert.equal(afterFallback.height, beforeFallback.height);
      assert.equal(afterFallback.width, beforeFallback.width);
      await db.query(
        "update giveaway_prizes set gift_image_url='/qa/gift.webp' where giveaway_id=$1",
        [primary],
      );
      animationFails = false;
      results.push(
        "failed TGS uses real static preview; total media failure is labelled without layout shift",
      );
    }
    await page
      .getByRole("button", { name: "Qolganlar (2)", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Bepul qatnashish", exact: true }),
    ).toBeVisible();
    assert.equal(
      await page.locator("[data-entry]").count(),
      0,
      "Compact list has no leaderboard",
    );
    await page.screenshot({
      path: `${out}/others-${width}.png`,
      fullPage: true,
    });
    if (width === 390) {
      const freeCard = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Bepul qatnashish",
          exact: true,
        }),
      });
      await freeCard.getByRole("button", { name: "Batafsil" }).click();
      await page
        .getByRole("button", { name: "Qatnashish", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Qatnashyapsiz", exact: true }),
      ).toBeDisabled();
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
      const paidCard = page.locator("article").filter({
        has: page.getByRole("heading", {
          name: "Maxsus sovrinlar",
          exact: true,
        }),
      });
      await paidCard.getByRole("button", { name: "Batafsil" }).click();
      const joinButton = page.getByRole("button", {
        name: "Qatnashish",
        exact: true,
      });
      const before = Number(
        (await db.query("select balance from users where id=1")).rows[0]
          .balance,
      );
      await joinButton.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(dialog).toContainText("Amaldan keyin");
      assert.equal(
        await page.evaluate(() => document.body.style.overflow),
        "hidden",
      );
      for (let i = 0; i < 7; i++) {
        await page.keyboard.press("Tab");
        assert.equal(
          await page.evaluate(
            () => document.activeElement.closest("dialog") !== null,
          ),
          true,
        );
      }
      await page.screenshot({ path: `${out}/payment-390.png` });
      await dialog
        .getByRole("button", { name: "Bekor qilish", exact: true })
        .click();
      await expect(joinButton).toBeFocused();
      assert.equal(
        Number(
          (await db.query("select balance from users where id=1")).rows[0]
            .balance,
        ),
        before,
      );
      await joinButton.click();
      dropReply = true;
      await page
        .getByRole("button", { name: "Tasdiqlash va qatnashish" })
        .evaluate((button) => {
          button.click();
          button.click();
        });
      await expect(
        page.getByRole("button", { name: "Holatni tekshirish" }),
      ).toBeVisible({ timeout: 20000 });
      const lost = joins.at(-1);
      const debited = Number(
        (await db.query("select balance from users where id=1")).rows[0]
          .balance,
      );
      assert.equal(debited, before - 25);
      await page.getByRole("button", { name: "Ro‘yxatga qaytish" }).click();
      await page
        .getByRole("button", { name: "Orqaga qaytish", exact: true })
        .click();
      await page.getByRole("button", { name: /^GIVEAWAY,/ }).click();
      await page.getByRole("button", { name: "Holatni tekshirish" }).click();
      await expect(
        page.getByRole("button", { name: "Holatni tekshirish" }),
      ).toHaveCount(0);
      assert.equal(joins.at(-1).requestId, lost.requestId);
      assert.equal(
        Number(
          (await db.query("select balance from users where id=1")).rows[0]
            .balance,
        ),
        debited,
      );
      await page
        .getByRole("button", { name: /Yana qatnashchilarni ko‘rish/ })
        .click();
      await expect(
        page.locator("[data-giveaway-rows] [data-entry]"),
      ).toHaveCount(60);
      await rpc("newpro_giveaway_join", {
        p_giveaway: primary,
        p_user: 65,
        p_amount: 50,
        p_request: crypto.randomUUID(),
      });
      await page
        .getByRole("button", { name: /Yana qatnashchilarni ko‘rish/ })
        .click();
      await expect(
        page.locator("[data-giveaway-rows] [data-entry]"),
      ).toHaveCount(30);
      await expect(
        page.getByText("Ishtirokchilar o‘zgardi.", { exact: false }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: /Yana qatnashchilarni ko‘rish/ })
        .click();
      await page
        .getByRole("button", { name: /Yana qatnashchilarni ko‘rish/ })
        .click();
      await expect(
        page.locator("[data-giveaway-rows] [data-entry]"),
      ).toHaveCount(65);
      const keys = await page
        .locator("[data-giveaway-rows] [data-entry]")
        .evaluateAll((rows) => rows.map((row) => row.dataset.entry));
      assert.equal(new Set(keys).size, 65);
      await page.getByLabel("Qo‘shiladigan Stars").fill("20000");
      await expect(
        page.getByText(
          "Bir martada ko‘pi bilan 10 000 Stars qo‘shish mumkin.",
          { exact: true },
        ),
      ).toBeVisible();
      await page.getByLabel("Qo‘shiladigan Stars").fill("10");
      await page
        .getByRole("button", { name: "Yana Stars qo‘shish", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Tasdiqlash va qatnashish" })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await page
        .getByRole("button", { name: "Yana Stars qo‘shish", exact: true })
        .scrollIntoViewIfNeeded();
      assert.equal(
        await hero.getAttribute("data-playing"),
        "false",
        "Offscreen animation pauses",
      );
      await hero.scrollIntoViewIfNeeded();
      await page.emulateMedia({ reducedMotion: "reduce" });
      await expect(hero).toHaveAttribute("data-playing", "false");
      await page.emulateMedia({ reducedMotion: "no-preference" });
      await expect(hero).toHaveAttribute("data-playing", "true");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "hidden",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await expect(hero).toHaveAttribute("data-playing", "false");
      await page.evaluate(() => {
        Object.defineProperty(document, "visibilityState", {
          configurable: true,
          value: "visible",
        });
        document.dispatchEvent(new Event("visibilitychange"));
      });
      // A server time sync corrects a device clock that is days ahead.
      await page.evaluate(() => {
        Date.now = () => new Date("2030-01-01").getTime();
      });
      await page
        .getByRole("button", { name: "Giveawaylarni yangilash" })
        .click();
      await expect(
        page.getByRole("button", { name: "Yana Stars qo‘shish", exact: true }),
      ).toBeEnabled();
      await db.query(
        "update giveaways set ends_at=now()+interval '3 seconds' where id=$1",
        [primary],
      );
      await page
        .getByRole("button", { name: "Giveawaylarni yangilash" })
        .click();
      await page
        .getByRole("button", { name: "Yana Stars qo‘shish", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Tasdiqlash va qatnashish" }),
      ).toBeDisabled({ timeout: 7000 });
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Bekor qilish", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Asosiy tanlov belgilanmagan" }),
      ).toBeVisible();
      results.push(
        "free, paid cancel, focus containment/return, double click, lost reply + navigation retry, weighted addition, 65-person revision pagination, offscreen/hidden/reduced-motion, skewed clock, expiry during confirmation",
      );
    }
    await page.goto(base + "/admin", { waitUntil: "domcontentloaded" });
    await page
      .getByRole("button", { name: "🎁 Giveaways", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Giveaway Studio" }),
    ).toBeVisible();
    await page.screenshot({
      path: `${out}/admin-list-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page
        .locator(".ga-root")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      `Admin giveaway overflow at ${width}`,
    );
    await page
      .getByRole("button", { name: "Yangi yaratish", exact: true })
      .click();
    await page
      .getByLabel("Nomi", { exact: true })
      .fill("Yangi tanlov sovrinlari");
    await page
      .getByRole("button", { name: "1-o‘rin sovg‘asini tanlash" })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Sovg‘a qidirish")
      .fill("Telegram");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: /Telegram Gift/ })
      .click();
    await page.screenshot({
      path: `${out}/admin-editor-${width}.png`,
      fullPage: true,
    });
    assert.ok(
      await page
        .locator(".ga-root")
        .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
      `Editor overflow at ${width}`,
    );
    if (width === 390) {
      await page
        .getByRole("button", { name: "Draft yaratish", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Draftni tahrirlash", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Draftni tahrirlash", exact: true })
        .click();
      await page
        .getByLabel("Tugash vaqti", { exact: true })
        .fill(new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 16));
      await page
        .getByRole("button", { name: "O‘zgarishlarni saqlash" })
        .click();
      await expect(
        page.getByRole("button", { name: "E’lon qilish", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "E’lon qilingach asosiy qilish" })
        .click();
      await expect(
        page.getByRole("button", { name: "Asosiy rejasini olish" }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "E’lon qilish", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "E’lon qilingach asosiy",
      );
      await page
        .getByRole("button", { name: "Tasdiqlash va e’lon qilish" })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Asosiydan olish" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Tanlovni bekor qilish" }).click();
      await expect(page.getByRole("dialog")).toContainText("Stars’i");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Tasdiqlash", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(page.locator(".ga-detail .ga-status")).toHaveText(
        "Bekor qilingan",
      );
      results.push(
        "admin search picker, create, draft date edit, queued feature, publish + promotion, cancel in app",
      );
      await page
        .getByRole("button", { name: "Giveawaylar", exact: true })
        .click();
      const drawId = await create("Natija va yetkazish sinovi", "equal", 0);
      await rpc("newpro_giveaway_join", {
        p_giveaway: drawId,
        p_user: 1,
        p_amount: 0,
        p_request: crypto.randomUUID(),
      });
      await db.query(
        "update giveaways set starts_at=now()-interval '2 days',ends_at=now()-interval '1 minute' where id=$1",
        [drawId],
      );
      await page
        .locator(".ga-header")
        .getByRole("button", { name: "Yangilash", exact: true })
        .click();
      await page
        .locator(".ga-list-card")
        .filter({
          has: page.getByRole("heading", {
            name: "Natija va yetkazish sinovi",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Batafsil" })
        .click();
      await page
        .getByRole("button", { name: "G‘oliblarni aniqlash", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Tasdiqlash", exact: true })
        .click();
      await expect(page.locator(".ga-detail .ga-status")).toHaveText(
        "Yakunlangan",
      );
      await page
        .getByLabel("1-o‘rin yetkazish qaydi")
        .fill("Test-only manual reference 123");
      await page
        .getByRole("button", { name: "Yetkazishni qayd etish", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "avtomatik yubormaydi",
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Tasdiqlash", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(
        page.getByText("Yetkazilgan deb qayd etilgan", { exact: true }),
      ).toBeVisible();
      const delivered = (
        await db.query(
          "select delivery_status from giveaway_prizes where giveaway_id=$1 and place=1",
          [drawId],
        )
      ).rows[0];
      assert.equal(delivered.delivery_status, "delivered");
      await db.query(
        "update giveaways set starts_at=now()-interval '2 days',ends_at=now()-interval '1 minute' where id=$1",
        [draft],
      );
      await page
        .getByRole("button", { name: "Giveawaylar", exact: true })
        .click();
      await page
        .locator(".ga-header")
        .getByRole("button", { name: "Yangilash", exact: true })
        .click();
      await page
        .locator(".ga-list-card")
        .filter({
          has: page.getByRole("heading", {
            name: "Yangi hafta sovrinlari",
            exact: true,
          }),
        })
        .getByRole("button", { name: "Batafsil" })
        .click();
      await page
        .getByRole("button", { name: "E’lon qilish", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toContainText("Muddat tugagan.");
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Draftni tahrirlash", exact: true })
        .click();
      await page
        .getByLabel("Tugash vaqti", { exact: true })
        .fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
      await page
        .getByRole("button", { name: "O‘zgarishlarni saqlash" })
        .click();
      await expect(
        page.getByRole("button", { name: "E’lon qilish", exact: true }),
      ).toBeVisible();
      results.push(
        "admin draw and delivery record confirmations; expired draft date can be repaired in place",
      );
    }
    assert.deepEqual(nativeDialogs, []);
    assert.deepEqual(pageErrors, []);
    results.push(
      `${width}px user, compact list, admin list and editor: no giveaway overflow or runtime errors`,
    );
    await context.close();
    await db.close();
  }
  await fs.writeFile(
    `${out}/results.json`,
    JSON.stringify({ passed: true, results }, null, 2),
  );
  console.log(JSON.stringify({ passed: true, results }, null, 2));
} catch (error) {
  if (currentPage && !currentPage.isClosed()) {
    await currentPage.screenshot({
      path: `${out}/failure.png`,
      fullPage: true,
    });
    console.error(
      (await currentPage.locator("body").innerText()).slice(0, 6000),
    );
  }
  throw error;
} finally {
  await browser?.close();
  server?.kill("SIGTERM");
  if (server && server.exitCode === null)
    await Promise.race([
      new Promise((resolve) => server.once("exit", resolve)),
      wait(5000),
    ]);
  await fs.writeFile(`${out}/server.log`, serverLog);
}
