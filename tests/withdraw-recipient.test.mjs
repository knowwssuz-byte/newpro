import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeTelegramUsername,
  validateWithdrawalRecipient,
  recipientLabel,
} from '../lib/withdrawRecipient.mjs';
import { getInventoryRows } from '../lib/inventory.mjs';

test('Telegram usernames are normalized, but URLs, usernames with spaces, and HTML are blocked', () => {
  assert.equal(normalizeTelegramUsername(' @Test_user99 '), 'Test_user99');
  assert.equal(normalizeTelegramUsername('validuser'), 'validuser');
  assert.equal(normalizeTelegramUsername('https://t.me/validuser'), '');
  assert.equal(normalizeTelegramUsername('@bad'), '');
  assert.equal(normalizeTelegramUsername('<b>validuser</b>'), '');
  assert.equal(normalizeTelegramUsername('name @someone'), '');
  assert.equal(normalizeTelegramUsername('1stuser'), '');
  assert.equal(normalizeTelegramUsername('a'.repeat(33)), '');
});

test('self mode always uses the verified Telegram account when available', () => {
  const result = validateWithdrawalRecipient({
    mode: 'self', username: '@attacker99', verifiedUsername: 'realowner99',
  });
  assert.deepEqual(result, { ok: true, mode: 'self', username: 'realowner99', source: 'telegram' });
});

test('self mode with no profile username requires a manually entered recipient', () => {
  assert.equal(validateWithdrawalRecipient({ mode: 'self', username: '', verifiedUsername: '' }).ok, false);
  const manual = validateWithdrawalRecipient({
    mode: 'self', username: '@mysecondaccount', verifiedUsername: '',
  });
  assert.equal(manual.ok, true);
  assert.equal(manual.source, 'entered');
});

test('other mode requires a destination even if sender has a username', () => {
  assert.equal(validateWithdrawalRecipient({ mode: 'other', username: '', verifiedUsername: 'owner007' }).ok, false);
  const friend = validateWithdrawalRecipient({ mode: 'other', username: '@friend007', verifiedUsername: 'owner007' });
  assert.equal(friend.username, 'friend007');
  assert.equal(friend.source, 'entered');
  assert.equal(recipientLabel({ recipient_username: 'friend007' }), '@friend007');
});

test('pending and approved gift withdrawals do not appear in owned Inventory', () => {
  const item = { id: 'history-1', gift_id: 'gift-1', sold_at: null, case_id: null };
  const gift = { id: 'gift-1', title: 'Golden Rose', type: 'gift' };
  const pending = { history_id: 'history-1', status: 'pending' };
  const rejected = { history_id: 'history-1', status: 'rejected' };
  assert.equal(getInventoryRows([item], [gift], [], [pending]).length, 0);
  assert.equal(getInventoryRows([item], [gift], [], [{ ...pending, status: 'approved' }]).length, 0);
  assert.equal(getInventoryRows([item], [gift], [], [rejected]).length, 1);
});
