import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

test('Home Upgrade shortcut shows Upgrade title and navigates to live Upgrade lab', () => {
  const web = read('app/webapp/WebAppClient.jsx');
  const homeStart = web.indexOf('function HomeView(');
  const homeEnd = web.indexOf('function CasesView(', homeStart);
  assert.ok(homeStart !== -1 && homeEnd > homeStart);
  const home = web.slice(homeStart, homeEnd);
  assert.match(home, /onClick=\{onGoUpgrade\}/);
  assert.match(home, /<strong>Upgrade<\/strong>/);
  assert.match(home, /<small>Gift Upgrade Lab<\/small>/);
  assert.match(web, /onGoUpgrade=\{openUpgradeLab\}/);
  assert.match(web, /setTab\('upgrade'\)/);
  assert.match(web, /tab === 'upgrade' \? extrasState !== 'ready'/);
  assert.match(web, /<UpgradeLab history=\{history\}/);
});
test('Home shortcut CSS no longer falsely changes Upgrade into Inventory', () => {
  const css = read('app/webapp/premium-polish.css');
  assert.doesNotMatch(css, /content:\s*["']Inventory["']/);
  assert.doesNotMatch(css, /content:\s*["']Your rewards["']/);
  assert.doesNotMatch(css, /\.premium-home > div:nth-child\(2\) > button:nth-child\(2\) > span:nth-child\(2\) strong::after/);
  assert.match(css, /font-size: 13px !important/);
});
