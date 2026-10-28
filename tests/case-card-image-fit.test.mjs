import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('case card and detail keep full artwork visible on narrow screens', () => {
  const css = readFileSync(new URL('../app/webapp/CaseOpening.module.css', import.meta.url), 'utf8');
  const responsiveRules = css.split('NEWPRO CASE ART FIT V35')[1];
  assert.ok(responsiveRules, 'expected responsive artwork rules');
  assert.match(responsiveRules, /\.caseTileImage\s*\{/);
  assert.match(responsiveRules, /\.caseStageArt\s*\{/);
  assert.match(responsiveRules, /object-fit:\s*contain/);
  assert.match(responsiveRules, /max-width:\s*none/);
  assert.match(responsiveRules, /max-height:\s*none/);
  assert.match(responsiveRules, /max-width:\s*520px/);
  assert.match(responsiveRules, /max-width:\s*350px/);
});
