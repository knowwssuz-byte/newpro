import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const component = read('app/webapp/StarIcon.jsx');
const stylesheet = read('app/webapp/StarIcon.module.css');

test('authentic Telegram Stars is used for both gold and monochrome placements', () => {
  assert.match(component, /src="\/currency\/stars\.png"/);
  assert.match(component, /styles\.mono/);
  assert.match(component, /styles\.gold/);
  assert.match(stylesheet, /\.mono\{filter:grayscale\(1\)/);
  assert.match(stylesheet, /\.gold\{filter:drop-shadow/);
  assert.doesNotMatch(component, /stars-.*\.svg/);
});

test('the two variants preserve the official currency silhouette', () => {
  assert.doesNotMatch(stylesheet, /clip-path|mask-image|hue-rotate/);
  const bytes = readFileSync(new URL('../public/currency/stars.png', import.meta.url));
  assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.ok(bytes.readUInt32BE(16) >= 512);
  assert.ok(bytes.length > 20000);
  for (const name of ['gold','prism','aurora','royal','nova']) {
    assert.equal(existsSync(new URL('../public/currency/stars-'+name+'.svg', import.meta.url)), false);
  }
});
