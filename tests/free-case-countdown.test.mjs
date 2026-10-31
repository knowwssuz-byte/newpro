import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FREE_CASE_COOLDOWN_MS,
  nextFreeCaseAt,
  freeCaseSecondsLeft,
  formatFreeCaseCountdown,
} from '../lib/freeCaseCooldown.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('24-hour free cooldown is exact and formats a live HH:MM:SS timer', () => {
  const opening = '2026-10-31T06:30:00.000Z';
  const deadline = nextFreeCaseAt(opening);
  assert.equal(FREE_CASE_COOLDOWN_MS, 86_400_000);
  assert.equal(deadline, '2026-11-01T06:30:00.000Z');
  assert.equal(freeCaseSecondsLeft(deadline, Date.parse(opening)), 86400);
  assert.equal(freeCaseSecondsLeft(deadline, Date.parse(opening) + 1_000), 86399);
  assert.equal(formatFreeCaseCountdown(86400), '24:00:00');
  assert.equal(formatFreeCaseCountdown(86399), '23:59:59');
  assert.equal(formatFreeCaseCountdown(3661), '01:01:01');
  assert.equal(formatFreeCaseCountdown(0), '00:00:00');
  assert.equal(freeCaseSecondsLeft(deadline, Date.parse(deadline)), 0);
  assert.equal(freeCaseSecondsLeft(deadline, Date.parse(deadline) + 1000), 0);
  assert.equal(nextFreeCaseAt(null), null);
  assert.equal(freeCaseSecondsLeft('not-a-date'), 0);
});

test('initial Telegram bootstrap restores free case cooldown from authenticated SQL history', () => {
  const route = read('app/api/bootstrap/route.js');
  assert.match(route, /cases!inner\(price\)/);
  assert.match(route, /\.eq\('user_id', auth\.telegramUser\.id\)/);
  assert.match(route, /\.eq\('cases\.price', 0\)/);
  assert.match(route, /freeCaseNextAt = nextFreeCaseAt\(lastFreeOpen\?\.created_at\)/);
  assert.match(route, /freeCaseServerNow: new Date\(\)\.toISOString\(\)/);
  assert.match(route, /'Cache-Control': 'private, no-store'/);
});

test('case buttons, case detail, and win modal disable during countdown', () => {
  const app = read('app/webapp/WebAppClient.jsx');
  const detail = read('app/webapp/CaseDetailExperience.jsx');
  const hook = read('app/webapp/useFreeCaseCountdown.js');
  const css = read('app/webapp/CaseOpening.module.css');
  assert.match(app, /freeCaseNextAt, setFreeCaseNextAt/);
  assert.match(app, /nextFreeCaseAt\(result\.history\?\.created_at/);
  assert.match(app, /const onCooldown = isFree && secondsLeft > 0/);
  assert.match(app, /disabled=\{disabled\}/);
  assert.match(app, /formatFreeCaseCountdown\(secondsLeft\)/);
  assert.match(detail, /disabled=\{busy \|\| isSpinning \|\| onCooldown \|\| openableGifts\.length === 0\}/);
  assert.match(detail, /disabled=\{cooldownSeconds > 0\}/);
  assert.match(detail, /formatFreeCaseCountdown\(cooldownSeconds\)/);
  assert.match(hook, /window\.setInterval/);
  assert.match(hook, /visibilitychange/);
  assert.match(css, /\.caseTileOpen\.caseCooldownButton:disabled/);
  assert.match(css, /\.detailPage \.detailOpen\.caseCooldownButton:disabled/);
});
