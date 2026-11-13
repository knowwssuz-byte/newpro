import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGiveawayDb } from "./fixtures/giveaway-db.mjs";
import { giveawayHandlers } from "./fixtures/giveaway-handlers.mjs";

test("real API handlers round-trip through isolated PostgreSQL and preserve authentication", async (t) => {
  const db = await createGiveawayDb();
  t.after(() => db.close());
  const { publicPost, adminPost } = await giveawayHandlers(db);
  const call = async (post, body, admin = false) => {
    const response = await post(
      new Request("http://localhost/api/test", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(admin ? { cookie: "newpro_admin=isolated-qa-session" } : {}),
        },
        body: JSON.stringify(body),
      }),
    );
    return { status: response.status, ...(await response.json()) };
  };
  assert.equal((await call(publicPost, { action: "list" })).status, 401);
  assert.equal(
    (await call(adminPost, { action: "giveaway_list" })).status,
    401,
  );
  const gift = randomUUID();
  await db.query(
    "insert into gift_library(id,title,image_url,animation_url) values($1,'Real catalogue gift','preview.webp','animated.tgs')",
    [gift],
  );
  await db.exec(
    "insert into users(id,first_name,balance) values(1,'Test',100)",
  );
  const created = await call(
    adminPost,
    {
      action: "giveaway_create",
      title: "API giveaway",
      description: "",
      mode: "weighted",
      entryPrice: 10,
      endsAt: new Date(Date.now() + 86400000).toISOString(),
      prizeIds: [gift],
    },
    true,
  );
  assert.equal(created.status, 200);
  assert.ok(created.id);
  const draft = (await call(adminPost, { action: "giveaway_list" }, true))
    .giveaways[0];
  assert.equal(draft.prizes[0].giftAnimationUrl, "animated.tgs");
  const pub = await call(
    adminPost,
    { action: "giveaway_publish", id: created.id, updatedAt: draft.updated_at },
    true,
  );
  assert.equal(pub.status, 200);
  const payment = {
    initData: "isolated-qa-session",
    action: "join",
    giveawayId: created.id,
    stars: 20,
    requestId: randomUUID(),
  };
  const joined = await call(publicPost, payment);
  assert.equal(joined.balance, 80);
  const replay = await call(publicPost, payment);
  assert.equal(replay.balance, 80);
  assert.equal(replay.entry.replayed, true);
  const list = await call(publicPost, {
    initData: "isolated-qa-session",
    action: "list",
  });
  assert.equal(list.giveaways[0].myStars, 20);
  assert.equal(list.giveaways[0].prizes[0].animationUrl, "animated.tgs");
  const board = await call(publicPost, {
    initData: "isolated-qa-session",
    action: "leaderboard",
    giveawayId: created.id,
  });
  assert.equal(board.rows[0].chance, 100);
  assert.equal(board.me.rank, 1);
  assert.equal(
    (await call(publicPost, { ...payment, stars: 1, requestId: randomUUID() }))
      .status,
    409,
  );
});
