import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = name => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('upgrade UI stays compact and wheel remains the visual focus', () => {
  const page = read('app/webapp/UpgradeLab.jsx');
  const css = read('app/webapp/UpgradeLab.module.css');
  assert.match(page, /<strong>UPGRADE<\/strong><small>NEWPRO<\/small>/);
  assert.match(page, /<span>YUTISH EHTIMOLI<\/span>/);
  assert.match(page, /label="Beriladigan" subtitle="Inventardan"/);
  assert.match(page, /label="Olinadigan" subtitle="Yutuq"/);
  assert.doesNotMatch(page, /UPGRADE WHEEL|WIN CHANCE|SOVG‘A TANLANG|MULTIPLIER/);
  assert.match(css, /UPGRADE 3\.0/);
  assert.match(css, /width: min\(82vw, 340px, 50dvh\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /font-weight: 450/);
  assert.match(css, /max-width: 900px/);
});

test('upgrade monetary results and server-controlled animations remain unchanged', () => {
  const page = read('app/webapp/UpgradeLab.jsx');
  assert.match(page, /upgradeChance\(source,goal\)/);
  assert.match(page, /apiPost\('\/api\/upgrade'/);
  assert.match(page, /planUpgradeSpin\(/);
  assert.match(page, /didWheelLandInSafeZone\(/);
  assert.match(page, /setConfirm\(true\)/);
  assert.match(page, /UpgradeWheel chance=\{chance\}/);
  assert.match(page, /onTransitionEnd=/);
  assert.match(page, /chanceText\(chance\)/);
});
