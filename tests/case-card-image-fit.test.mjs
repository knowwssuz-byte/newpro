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

test('admin can replace an existing case image without recreating its gifts', () => {
  const admin = readFileSync(new URL('../app/admin/AdminClient.jsx', import.meta.url), 'utf8');
  const api = readFileSync(new URL('../app/api/browser-admin/route.js', import.meta.url), 'utf8');
  assert.match(admin, /Rasmni almashtirish/);
  assert.match(admin, /case_replace_image/);
  assert.match(api, /action === 'case_replace_image'/);
  assert.match(api, /uploadCaseImage\(supabase, formData\.get\('image_file'\), found\.title\)/);
});
