import test from "node:test";
import assert from "node:assert/strict";
import {
  chanceText,
  eventState,
  firstPlaceChance,
  mergeBoard,
  sameJoinTerms,
  serverClock,
  splitGiveaways,
  stakeError,
  timeLeft,
} from "../lib/giveawayUi.mjs";
import { joinedBalance, publicBoard } from "../lib/giveawayServer.mjs";
const now = Date.parse("2026-11-02T12:00:00Z");
const item = {
  id: "one",
  mode: "equal",
  status: "live",
  price: 0,
  endsAt: "2026-11-03T12:00:00Z",
  myWeight: 0,
  myStars: 0,
};

test("only explicitly featured active events are primary", () => {
  assert.equal(splitGiveaways([item], now).main, null);
  assert.equal(splitGiveaways([item], now).others.length, 1);
  const featured = { ...item, isFeatured: true };
  assert.equal(splitGiveaways([featured], now).main, featured);
  assert.equal(splitGiveaways([featured], now).others.length, 0);
  const expired = { ...featured, endsAt: "2026-11-01T12:00:00Z" };
  assert.equal(splitGiveaways([expired], now).main, null);
  assert.equal(splitGiveaways([expired], now).results.length, 1);
  assert.equal(eventState(expired, now), "drawing");
});
test("server clock is independent of device wall clock and never goes backwards", () => {
  const clock = serverClock("2026-11-02T12:00:00Z", 200);
  assert.equal(clock(1200), now + 1000);
  assert.equal(clock(0), now);
  assert.equal(serverClock("invalid", 0), null);
  assert.equal(timeLeft("invalid", now), "Muddat tugadi");
});
test("entry validation explains low balance, invalid integers and contribution limits", () => {
  assert.equal(stakeError(item, 0, 0, now), "");
  assert.match(stakeError({ ...item, myWeight: 1 }, 0, 0, now), /allaqachon/);
  const weighted = { ...item, mode: "weighted", price: 10 };
  assert.match(stakeError(weighted, 9, 100, now), /Kamida/);
  assert.match(stakeError(weighted, 10.5, 100, now), /Butun/);
  assert.match(stakeError(weighted, "", 100, now), /Butun/);
  assert.match(stakeError(weighted, 10001, 20000, now), /10 000/);
  assert.match(stakeError(weighted, 20, 10, now), /yetarli/);
  assert.match(stakeError(weighted, 20, null, now), /Balansni/);
  assert.equal(stakeError(weighted, 20, 100, now), "");
  assert.match(
    stakeError({ ...weighted, myStars: 99999999 }, 10, 100, now),
    /limit/,
  );
});
test("confirmation expires or invalidates changed terms", () => {
  assert.equal(sameJoinTerms(item, { ...item, participants: 99 }), true);
  for (const change of [
    { price: 5 },
    { mode: "weighted" },
    { status: "completed" },
    { endsAt: "2026-11-04T00:00:00Z" },
  ])
    assert.equal(sameJoinTerms(item, { ...item, ...change }), false);
  assert.match(stakeError(item, 0, 100, now + 86400000), /ochiq emas/);
});
test("small positive percentages and large totals are represented honestly", () => {
  assert.equal(firstPlaceChance(0, 0), 0);
  assert.equal(firstPlaceChance(1, 4), 25);
  assert.equal(firstPlaceChance(1, Infinity), 0);
  assert.equal(chanceText(firstPlaceChance(1, 1e15)), "<0.01%");
  assert.equal(chanceText(0), "0.00%");
  assert.equal(chanceText(firstPlaceChance(5e14, 1e15)), "50.00%");
});
test("changed leaderboard revision replaces old pages and stable IDs deduplicate", () => {
  const a = { key: "a", rank: 1 },
    b = { key: "b", rank: 2 },
    c = { key: "c", rank: 3 };
  const previous = { rows: [a, b], revision: "3:30" };
  assert.deepEqual(
    mergeBoard(previous, { rows: [b, c], revision: "3:30" }, true).rows,
    [a, b, c],
  );
  assert.deepEqual(
    mergeBoard(previous, { rows: [c], revision: "3:40", reset: true }, true)
      .rows,
    [c],
  );
});
test("a failed post-commit balance read never fabricates a zero balance", () => {
  assert.equal(joinedBalance({ error: { code: "NETWORK" }, data: null }), null);
  assert.equal(joinedBalance({ data: { balance: 0 } }), 0);
  assert.equal(joinedBalance({ data: { balance: "125.50" } }), 125.5);
  assert.equal(joinedBalance({ data: { balance: "invalid" } }), null);
});
test("public board exposes stable anonymous entry keys and my own rank without Telegram IDs", () => {
  const result = publicBoard({
    revision: "1:10",
    rows: [
      {
        key: "hashed",
        userId: 12345,
        rank: 1,
        name: "Name",
        chance: 100,
        isMe: true,
      },
    ],
    me: { key: "hashed", rank: 1, isMe: true },
    total: 1,
    totalWeight: 10,
  });
  assert.equal(result.rows[0].key, "hashed");
  assert.equal(result.rows[0].isMe, true);
  assert.equal(result.rows[0].userId, undefined);
  assert.equal(result.nextOffset, null);
});
