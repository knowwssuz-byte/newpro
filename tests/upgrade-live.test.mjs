import test from 'node:test';
import assert from 'node:assert/strict';
import { upgradeChance, planUpgradeSpin, didWheelLandInSafeZone } from '../lib/upgradeLab.mjs';
import { getInventoryRows, getGiftActivity } from '../lib/inventory.mjs';

test('quoted upgrade chance uses same formula and never falls below zero', () => {
  assert.equal(upgradeChance({ price: 10 }, { price: 20 }), 41);
  assert.equal(upgradeChance({ price: 10 }, { price: 100 }), 8.2);
  assert.equal(upgradeChance({ price: 10 }, { price: 10 }), 0);
  assert.equal(upgradeChance({ price: 1 }, { price: 1_000_000 }), 0);
  assert.equal(upgradeChance({ price: 0 }, { price: 20 }), 0);
});

test('spin plan correctly lands in the server-selected zone', () => {
  for (const chance of [0.01, 0.5, 5, 13.21, 41, 60, 82, 85]) {
    for (const randomValue of [0, .01, .25, .5, .75, .999999]) {
      for (const win of [true, false]) {
        const plan = planUpgradeSpin({ chance, previousRotation: 2049, pointerDeg: 180, win, randomValue });
        assert.equal(didWheelLandInSafeZone(chance, plan.endRotation, 180), win);
      }
    }
  }
});

test('upgrade-spent copies cannot return to inventory and are not called sales', () => {
  const gift = { id: 'g1', type: 'gift', title: 'Rocket', sell_price: 40 };
  const cases = [{ id: 'case1', title: 'One' }];
  const base = { user_id: 1, gift_id: 'g1', case_id: 'case1' };
  const history = [
    { ...base, id: 'mine', sold_at: null },
    { ...base, id: 'upgraded', sold_at: '2026-10-24T00:00:00Z', upgraded_at: '2026-10-24T00:00:00Z', sale_price: 0 },
    { ...base, id: 'sold', sold_at: '2026-10-24T00:00:00Z', sale_price: 40 },
  ];
  assert.deepEqual(getInventoryRows(history, [gift], cases, []).map(row => row.item.id), ['mine']);
  const activity = getGiftActivity(history, [gift], []);
  assert.equal(activity.find(row => row.id === 'upgraded')?.kind, 'upgrade');
  assert.equal(activity.find(row => row.id === 'sold')?.kind, 'sale');
});
