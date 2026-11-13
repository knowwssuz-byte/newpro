import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { giveawayPublishState } from "../lib/giveawayPublish.mjs";

const now = Date.parse("2026-11-02T12:00:00.000Z");
const draft = (overrides = {}) => ({
  status: "draft",
  mode: "equal",
  entry_price: 0,
  ends_at: "2026-11-11T17:55:00.000Z",
  ...overrides,
});
const read = (path) =>
  readFileSync(new URL("../" + path, import.meta.url), "utf8");

test("admin may publish free, paid and Stars-weighted drafts without feature flags", () => {
  assert.equal(giveawayPublishState(draft(), { now }), "ready");
  assert.equal(
    giveawayPublishState(draft({ entry_price: 1 }), { now }),
    "ready",
  );
  assert.equal(
    giveawayPublishState(draft({ mode: "weighted", entry_price: 1 }), { now }),
    "ready",
  );
  assert.equal(
    giveawayPublishState(draft({ mode: "weighted", entry_price: 100 }), {
      now,
    }),
    "ready",
  );
});

test("publishing still respects completed state and expired dates", () => {
  assert.equal(
    giveawayPublishState(draft({ status: "live" }), { now }),
    "not_draft",
  );
  assert.equal(giveawayPublishState(null, { now }), "not_draft");
  assert.equal(
    giveawayPublishState(draft({ ends_at: "2026-11-01T12:00:00Z" }), { now }),
    "expired",
  );
  assert.equal(
    giveawayPublishState(draft({ ends_at: "bad-date" }), { now }),
    "expired",
  );
});

test("giveaway flows contain no native confirmation calls and keep server authentication", () => {
  const paths = [
    "app/admin/GiveawayAdmin.jsx",
    "app/webapp/GiveawayHub.jsx",
    "app/webapp/GiveawayEventCard.jsx",
  ];
  for (const path of paths)
    assert.doesNotMatch(read(path), /window\.(confirm|alert|prompt)\s*\(/);
  const api = read("app/api/browser-admin/route.js");
  assert.match(api, /await assertAdminSession\(request\)/);
  assert.match(api, /newpro_giveaway_publish/);
  assert.match(api, /p_expected_updated_at:body.updatedAt/);
  assert.match(
    read("app/api/giveaway/route.js"),
    /readTelegramRequest\(request\)/,
  );
});
