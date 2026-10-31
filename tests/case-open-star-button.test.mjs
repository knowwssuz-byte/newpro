import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('case card and detail CTA use the same real transparent 3D Stars artwork', () => {
  const card = read('app/webapp/WebAppClient.jsx');
  const detail = read('app/webapp/CaseDetailExperience.jsx');
  const css = read('app/webapp/CaseOpening.module.css');
  const image = readFileSync(new URL('../public/currency/case-open-star-3d.png', import.meta.url));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.match(card, /<Image src="\/currency\/case-open-star-3d\.png" width=\{20\}/);
  assert.match(detail, /<Image src="\/currency\/case-open-star-3d\.png" width=\{22\}/);
  assert.match(card, /className=\{caseOpeningStyles\.casePriceStar\}/);
  assert.match(detail, /className=\{caseOpeningStyles\.casePriceStar\}/);
  assert.match(css, /\.casePriceStar\s*\{/);
  assert.doesNotMatch(card, /<AppIcon name="gift" \/>\s*<span>\{buttonText\}<\/span>/);
});

test('case opening prices, click handlers and loading state stay dynamic', () => {
  const card = read('app/webapp/WebAppClient.jsx');
  const detail = read('app/webapp/CaseDetailExperience.jsx');
  assert.match(card, /const buttonText = isFree \? 'FREE' : formatPrice\(caseItem\.price\)/);
  assert.match(card, /onOpen\(caseItem\);/);
  assert.match(detail, /const openText = isFree \? 'OPEN' : `OPEN \$\{formatPrice\(caseItem\.price\)\}`/);
  assert.match(detail, /disabled=\{busy \|\| isSpinning \|\| openableGifts\.length === 0\}/);
  assert.match(detail, /onOpen\(\)/);
});
