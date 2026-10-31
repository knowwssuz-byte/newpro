import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url),'utf8');

test('upgrade gift cards preserve full item name accessibly and wrap narrow labels',()=>{
  const jsx=read('app/webapp/UpgradeLab.jsx');
  const css=read('app/webapp/UpgradeLab.module.css');
  assert.match(jsx,/title=\{item\?\.title \|\| undefined\}/);
  assert.match(jsx,/aria-label=\{\[label, item\?\.title,/);
  assert.match(css,/UPGRADE 3\.1/);
  assert.match(css,/\.itemDetails>strong\s*\{[\s\S]*?-webkit-line-clamp:\s*2/);
  assert.match(css,/overflow-wrap:\s*anywhere/);
  assert.match(css,/\.changeItem\s*\{[\s\S]*?grid-column:\s*1\/-1/);
});
test('upgrade action is closer on short phones without changing the spin rules',()=>{
  const jsx=read('app/webapp/UpgradeLab.jsx');
  const css=read('app/webapp/UpgradeLab.module.css');
  assert.match(css, /max-height: 700px/);
  assert.match(css, /max-height: 580px/);
  assert.match(css, /width: min\(75vw, 286px, 39dvh\)/);
  assert.match(css, /\.improve \{ min-height: 45px; \}/);
  assert.match(jsx, /upgradeChance\(source,goal\)/);
  assert.match(jsx, /apiPost\('\/api\/upgrade'/);
  assert.match(jsx, /didWheelLandInSafeZone\(/);
});
