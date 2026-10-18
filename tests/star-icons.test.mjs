import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const component = readFileSync(new URL('../app/webapp/StarIcon.jsx', import.meta.url), 'utf8');
const stylesheet = readFileSync(new URL('../app/webapp/StarIcon.module.css', import.meta.url), 'utf8');
const originalAsset = new URL('../public/currency/stars.png', import.meta.url);

test('all five variants reuse the original Telegram Stars PNG rather than redraw stars', () => {
  assert.match(component, /src="\/currency\/stars\.png"/);
  for (const name of ['gold', 'prism', 'aurora', 'royal', 'nova']) {
    assert.match(component, new RegExp(`\\b${name}: '${name}'`));
    assert.match(stylesheet, new RegExp(`\\.${name}\\s*\\{`));
    assert.equal(existsSync(new URL(`../public/currency/stars-${name}.svg`, import.meta.url)), false);
  }
  assert.doesNotMatch(component, /\/currency\/stars-.*\.svg/);
});

test('authentic existing Telegram Stars asset is a full-resolution PNG', () => {
  const bytes = readFileSync(originalAsset);
  assert.equal(bytes.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.readUInt32BE(16) >= 512);
  assert.ok(bytes.readUInt32BE(20) >= 512);
  assert.ok(bytes.length > 20000);
});

test('five icon treatments only change the image glow, not its silhouette', () => {
  assert.match(stylesheet, /drop-shadow/);
  assert.doesNotMatch(stylesheet, /clip-path|mask-image|hue-rotate|grayscale/);
  assert.doesNotMatch(component, /fill=|path d=/);
});
