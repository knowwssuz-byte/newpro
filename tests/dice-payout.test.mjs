import test from 'node:test';
import assert from 'node:assert/strict';
import { getDiceMultiplier, getDicePayout } from '../lib/diceMath.mjs';

test('no positive player expectation across published odds and bets', () => {
  for (let chance = 5; chance <= 85; chance++) {
    for (const bet of [1, 2, 10, 20, 100, 10000]) {
      const pay = getDicePayout(bet, chance, 3, true);
      assert.ok(pay * chance / 100 <= bet * 0.97 + 1e-8, `bet=${bet} odds=${chance}`);
      assert.equal(getDicePayout(bet, chance, 3, false), 0);
    }
  }
});
test('small stakes cannot exploit forced bet+1 payout', () => {
  assert.equal(getDicePayout(1, 85, 3, true), 1);
  assert.equal(getDicePayout(10, 85, 3, true), 11);
  assert.equal(getDiceMultiplier(85, 3), 1.14);
});
test('invalid values are rejected', () => {
  assert.throws(() => getDicePayout(0, 85, 3, true));
  assert.throws(() => getDicePayout(5.5, 85, 3, true));
  assert.throws(() => getDiceMultiplier(0, 3));
});
