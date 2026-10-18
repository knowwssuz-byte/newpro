import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const variants = ['gold','prism','aurora','royal','nova'];
test('five lightweight, validly shaped Star SVG assets are present', () => {
  for (const name of variants) {
    const content = readFileSync(new URL('../public/currency/stars-' + name + '.svg', import.meta.url), 'utf8');
    assert.match(content, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
    assert.match(content, /viewBox="0 0 96 96"/);
    assert.match(content, /<linearGradient/);
    assert.match(content, /<\/svg>\s*$/);
    assert.ok(Buffer.byteLength(content) < 5000);
  }
});
test('each finish is a distinct SVG', () => {
  const values = variants.map(name => readFileSync(new URL('../public/currency/stars-'+name+'.svg',import.meta.url),'utf8'));
  assert.equal(new Set(values).size, variants.length);
});
