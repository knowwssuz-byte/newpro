import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createGiveawayDb } from "./fixtures/giveaway-db.mjs";

const gift = "a0000000-0000-4000-8000-000000000001";
test("giveaway database workflow uses atomic payments, versioned edits and consistent pages", async (t) => {
  const db = await createGiveawayDb();
  t.after(() => db.close());
  const scalar = async (sql, params = []) =>
    Object.values((await db.query(sql, params)).rows[0])[0];
  await db.query(
    "insert into gift_library(id,title,image_url,animation_url) values($1,'Crystal Gift','https://example.test/gift.webp','https://example.test/gift.tgs')",
    [gift],
  );
  await db.exec(
    "insert into users(id,first_name,balance) select n,'Player '||n,1000 from generate_series(1,65) n;",
  );
  const create = async (mode = "equal", price = 0, prizes = [gift]) =>
    scalar(
      "select newpro_giveaway_create('Test giveaway','Description',$1,$2,now()+interval '1 day',$3::uuid[])",
      [mode, price, prizes],
    );
  const version = (id) =>
    scalar("select updated_at::text from giveaways where id=$1", [id]);
  const publish = async (id) =>
    scalar("select newpro_giveaway_publish($1,$2)", [id, await version(id)]);
  const join = (id, user, amount, request = randomUUID()) =>
    scalar("select newpro_giveaway_join($1,$2,$3,$4)", [
      id,
      user,
      amount,
      request,
    ]);
  const board = (id, user, offset = 0, revision = null) =>
    scalar("select newpro_giveaway_leaderboard_v2($1,$2,30,$3,$4)", [
      id,
      user,
      offset,
      revision,
    ]);
  const expire = (id) =>
    db.query(
      "update giveaways set starts_at=now()-interval '2 days',ends_at=now()-interval '1 minute' where id=$1",
      [id],
    );
  let free, weighted;
  await t.test(
    "draft edit rolls back invalid gifts; stale edits cannot overwrite",
    async () => {
      free = await create();
      const old = await version(free);
      const args = [
        free,
        old,
        "Updated giveaway",
        "New terms",
        "equal",
        0,
        new Date(Date.now() + 86400000).toISOString(),
        [randomUUID()],
      ];
      await assert.rejects(
        scalar(
          "select newpro_giveaway_update_draft($1,$2,$3,$4,$5,$6,$7,$8::uuid[])",
          args,
        ),
        /GIFT_NOT_ACTIVE/,
      );
      assert.equal(
        await scalar("select title from giveaways where id=$1", [free]),
        "Test giveaway",
      );
      args[7] = [gift, gift];
      assert.equal(
        await scalar(
          "select newpro_giveaway_update_draft($1,$2,$3,$4,$5,$6,$7,$8::uuid[])",
          args,
        ),
        free,
      );
      await assert.rejects(
        scalar(
          "select newpro_giveaway_update_draft($1,$2,$3,$4,$5,$6,$7,$8::uuid[])",
          args,
        ),
        /DRAFT_CHANGED/,
      );
      await publish(free);
      await assert.rejects(
        scalar(
          "select newpro_giveaway_update_draft($1,$2,$3,$4,$5,$6,$7,$8::uuid[])",
          args,
        ),
        /NOT_DRAFT/,
      );
    },
  );
  await t.test("free joins are unique and retry-safe", async () => {
    const request = randomUUID();
    assert.equal((await join(free, 1, 0, request)).replayed, false);
    assert.equal((await join(free, 1, 0, request)).replayed, true);
    await assert.rejects(join(free, 1, 0), /ALREADY_JOINED/);
    assert.equal(
      Number(await scalar("select balance from users where id=1")),
      1000,
    );
  });
  await t.test(
    "draft feature intent does not displace live feature; publication does",
    async () => {
      await scalar("select newpro_giveaway_set_featured($1,true)", [free]);
      weighted = await create("weighted", 10, [gift, gift]);
      await scalar("select newpro_giveaway_set_featured($1,true)", [weighted]);
      assert.equal(
        await scalar("select id from giveaways where is_featured"),
        free,
      );
      assert.equal(
        await scalar("select feature_on_publish from giveaways where id=$1", [
          weighted,
        ]),
        true,
      );
      await publish(weighted);
      assert.equal(
        await scalar("select id from giveaways where is_featured"),
        weighted,
      );
      assert.equal(
        Number(
          await scalar("select count(*) from giveaways where is_featured"),
        ),
        1,
      );
    },
  );
  await t.test(
    "paid join retries debit once; invalid amount and insufficient balance debit nothing",
    async () => {
      const request = randomUUID();
      await join(weighted, 1, 50, request);
      await join(weighted, 1, 50, request);
      assert.equal(
        Number(await scalar("select balance from users where id=1")),
        950,
      );
      await assert.rejects(join(weighted, 1, 60, request), /REQUEST_CONFLICT/);
      await assert.rejects(join(weighted, 1, 1), /INVALID_STAKE/);
      await assert.rejects(join(weighted, 1, 2000), /INSUFFICIENT_BALANCE/);
      assert.equal(
        Number(await scalar("select balance from users where id=1")),
        950,
      );
      await join(weighted, 1, 20);
      assert.equal(
        Number(
          await scalar(
            "select total_stars from giveaway_entries where giveaway_id=$1 and user_id=1",
            [weighted],
          ),
        ),
        70,
      );
    },
  );
  await t.test(
    "all participants paginate with own rank, no duplicates, and reset on changed order",
    async () => {
      for (let user = 2; user <= 65; user++) await join(weighted, user, 10);
      const first = await board(weighted, 65);
      assert.equal(first.rows.length, 30);
      assert.equal(first.me.rank, 65);
      assert.equal(first.total, 65);
      assert.ok(Math.abs(first.rows[0].chance - (70 / 710) * 100) < 1e-10);
      const second = await board(
        weighted,
        65,
        first.nextOffset,
        first.revision,
      );
      const third = await board(
        weighted,
        65,
        second.nextOffset,
        second.revision,
      );
      assert.equal(
        new Set(
          [...first.rows, ...second.rows, ...third.rows].map((row) => row.key),
        ).size,
        65,
      );
      assert.equal(third.nextOffset, null);
      await join(weighted, 65, 100);
      const changed = await board(
        weighted,
        65,
        first.nextOffset,
        first.revision,
      );
      assert.equal(changed.reset, true);
      assert.equal(changed.rows[0].isMe, true);
      assert.equal(changed.rows[0].rank, 1);
    },
  );
  await t.test(
    "feed exposes real animation, feature and startsAt without leaking unrevealed seed",
    async () => {
      const list = await scalar("select newpro_giveaway_public_list(1)");
      const item = list.find((g) => g.id === weighted);
      assert.equal(item.isFeatured, true);
      assert.equal(item.seedReveal, null);
      assert.equal(
        item.prizes[0].animationUrl,
        "https://example.test/gift.tgs",
      );
      assert.ok(item.startsAt);
      const admin = (await scalar("select newpro_giveaway_admin_list()")).find(
        (g) => g.id === weighted,
      );
      assert.equal(admin.prizes[0].libraryGiftId, gift);
      assert.ok(admin.updated_at);
    },
  );
  await t.test(
    "deadline rejects new charges but a lost successful reply replays after closure",
    async () => {
      const request = randomUUID();
      await join(weighted, 2, 15, request);
      await expire(weighted);
      assert.equal((await join(weighted, 2, 15, request)).replayed, true);
      await assert.rejects(join(weighted, 2, 15), /GIVEAWAY_NOT_OPEN/);
      await scalar("select newpro_giveaway_draw($1)", [weighted]);
      const winners = (
        await db.query(
          "select winner_id from giveaway_prizes where giveaway_id=$1",
          [weighted],
        )
      ).rows;
      assert.equal(winners.length, 2);
      assert.equal(new Set(winners.map((w) => w.winner_id)).size, 2);
      assert.equal(
        (await scalar("select newpro_giveaway_draw($1)", [weighted]))
          .alreadyDrawn,
        true,
      );
    },
  );
  await t.test(
    "cancel refunds once, delivery only records an admin note",
    async () => {
      const paid = await create("equal", 25);
      await publish(paid);
      await join(paid, 3, 25);
      const before = Number(
        await scalar("select balance from users where id=3"),
      );
      await scalar("select newpro_giveaway_cancel($1)", [paid]);
      await scalar("select newpro_giveaway_cancel($1)", [paid]);
      assert.equal(
        Number(await scalar("select balance from users where id=3")),
        before + 25,
      );
      const prize = await scalar(
        "select id from giveaway_prizes where giveaway_id=$1 order by place limit 1",
        [weighted],
      );
      const delivered = await scalar(
        "select newpro_giveaway_delivery($1,'Manual proof 123')",
        [prize],
      );
      assert.equal(delivered.delivered, true);
      assert.equal(
        await scalar(
          "select delivery_status from giveaway_prizes where id=$1",
          [prize],
        ),
        "delivered",
      );
    },
  );
  await t.test(
    "anon/authenticated cannot invoke payment or admin RPCs or read raw entries",
    async () => {
      assert.equal(
        await scalar(
          "select has_function_privilege('anon','newpro_giveaway_join(uuid,bigint,integer,uuid)','EXECUTE')",
        ),
        false,
      );
      assert.equal(
        await scalar(
          "select has_function_privilege('authenticated','newpro_giveaway_update_draft(uuid,timestamptz,text,text,text,integer,timestamptz,uuid[])','EXECUTE')",
        ),
        false,
      );
      assert.equal(
        await scalar(
          "select has_function_privilege('service_role','newpro_giveaway_leaderboard_v2(uuid,bigint,integer,integer,text)','EXECUTE')",
        ),
        true,
      );
      assert.equal(
        await scalar(
          "select has_table_privilege('anon','giveaway_entries','SELECT')",
        ),
        false,
      );
    },
  );
});
