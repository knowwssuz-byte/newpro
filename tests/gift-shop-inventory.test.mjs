import test from 'node:test';
import assert from 'node:assert/strict';
import { getInventoryRows, getGiftActivity } from '../lib/inventory.mjs';

const shopGift = {
  id: 'gift-shop-copy',
  title: 'Telegram Rose',
  type: 'gift',
  source: 'gift_shop_purchase',
  case_id: null,
  stock: 0,
  sell_price: 80,
};
const purchased = {
  id: 'history-shop-copy',
  gift_id: shopGift.id,
  case_id: null,
  user_id: 12345,
  created_at: '2026-11-13T15:00:00.000Z',
  sold_at: null,
};

test('a bought gift is real inventory without a case or case stock', () => {
  const rows = getInventoryRows([purchased], [shopGift], [], []);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].item.id, purchased.id);
  assert.equal(rows[0].gift.source, 'gift_shop_purchase');
  assert.equal(rows[0].caseItem, null);
});

test('a withdrawn or sold shop gift is no longer an available copy', () => {
  const pending = [{ id:'request-1', history_id:purchased.id, status:'pending', gift_id: shopGift.id }];
  assert.equal(getInventoryRows([purchased], [shopGift], [], pending).length, 0);
  assert.equal(getInventoryRows([{...purchased, sold_at:'2026-11-13T15:01:00Z'}], [shopGift], [], []).length, 0);
  assert.equal(getInventoryRows([purchased], [shopGift], [], [{...pending[0], status:'rejected'}]).length, 1);
});

test('a shop gift is excluded from the balance reward filter only by its own type', () => {
  const coins = { ...shopGift, id:'balance-1', type:'balance', title:'100 Stars' };
  assert.equal(getInventoryRows([purchased, {...purchased,id:'h2',gift_id:'balance-1'}], [shopGift,coins], [], []).length, 1);
});

test('selling a bought gift appears in the existing activity timeline', () => {
  const activity = getGiftActivity([{...purchased, sold_at:'2026-11-13T16:01:00Z', sale_price:80}], [shopGift], []);
  assert.equal(activity.length,1);
  assert.equal(activity[0].amount,80);
  assert.equal(activity[0].kind,'sale');
});
