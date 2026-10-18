import test from 'node:test';
import assert from 'node:assert/strict';
import { getInventoryRows, isInventoryGift } from '../lib/inventory.mjs';

const gift = (id, title = 'Collectible', type = 'gift') => ({ id, title, type });
const copy = (id, gift_id, extra = {}) => ({ id, gift_id, case_id: 'case-1', ...extra });

test('Stars and balance rewards never appear in gift inventory', () => {
  const gifts = [gift('g1'), gift('g2', '25 Stars', 'balance'), gift('g3', '100 ⭐'), gift('g4', 'Telegram Stars')];
  assert.deepEqual(getInventoryRows([copy('h1','g1'), copy('h2','g2'), copy('h3','g3'), copy('h4','g4')], gifts).map(r=>r.item.id), ['h1']);
  assert.equal(isInventoryGift(gift('g5','Star Warrior')), true);
});

test('sold gift disappears but another copy of the same prize remains', () => {
  const result = getInventoryRows([
    copy('a', 'g1', { sold_at: '2026-10-18T10:00:00Z' }),
    copy('b', 'g1'),
  ], [gift('g1')]);
  assert.deepEqual(result.map(r=>r.item.id), ['b']);
});

test('withdrawal status belongs to the history copy, not all copies of a gift', () => {
  const result = getInventoryRows(
    [copy('a', 'g1'), copy('b', 'g1')],
    [gift('g1')],
    [],
    [{ id: 'w1', history_id: 'a', gift_id: 'g1', status: 'pending' }]
  );
  assert.equal(result[0].request.status, 'pending');
  assert.equal(result[1].request, null);
});

test('an unresolved old-style withdrawal never blocks every identical copy', () => {
  const result = getInventoryRows(
    [copy('a', 'g1'), copy('b', 'g1')],
    [gift('g1')],
    [],
    [{ id:'legacy', gift_id:'g1', status:'pending' }]
  );
  assert.ok(result.every(r=>!r.request));
});
