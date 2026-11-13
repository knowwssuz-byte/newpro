import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {prepareCaseArtwork} from '../lib/caseImageAutoFitBrowser.mjs';

const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');

test('admin verifies upload bytes before storing and preserves browser artwork sizing', () => {
  const route = read('app/api/browser-admin/route.js');
  assert.match(route, /await validateImage/);
  assert.match(route, /contentType: checked.contentType/);
  assert.match(route, /ext: checked.ext/);
});

test('case upload and replacement both auto-normalize in browser', () => {
  const admin = read('app/admin/AdminClient.jsx');
  assert.match(admin, /prepareCaseArtwork\(caseFile\)/);
  assert.match(admin, /prepareCaseArtwork\(file\)/);
  const helper = read('lib/caseImageAutoFitBrowser.mjs');
  assert.match(helper, /Math\.min\(\(size - pad \* 2\)/);
  assert.match(helper, /canvas\.toBlob\(resolve, 'image\/png'\)/);
  assert.match(helper, /const size = 1024/);
});

test('browser helper falls back cleanly when browser APIs are unavailable', async () => {
  const file = { name: 'safe.png', size: 5 };
  assert.strictEqual(await prepareCaseArtwork(file), file);
});
