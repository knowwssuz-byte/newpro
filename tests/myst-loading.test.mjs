import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIRST_VIEW_ART, isSlowConnection, preloadDecodedImage, prepareFirstView, warmNearViewport } from '../lib/mystAssetReadiness.mjs';
const read = (path) => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('first-view artwork uses small existing WebP files', () => {
  assert.equal(FIRST_VIEW_ART.length, 3);
  for (const path of FIRST_VIEW_ART) {
    const image = readFileSync(new URL('../public'+path, import.meta.url));
    assert.equal(image.toString('ascii', 0, 4), 'RIFF');
    assert.equal(image.toString('ascii', 8, 12), 'WEBP');
  }
});
test('cache avoids duplicate image transfer/decode', async () => {
  let calls = 0;
  const makeImage = () => ({
    decode: async () => { calls++; },
    set src(_) { queueMicrotask(() => this.onload?.()); },
    get complete() { return false; },
  });
  const url = '/myst-dedupe-'+Date.now()+'.webp';
  const [a,b] = await Promise.all([
    preloadDecodedImage(url, { makeImage }),
    preloadDecodedImage(url, { makeImage }),
  ]);
  assert.equal(a, true); assert.equal(b,true); assert.equal(calls,1);
});
test('image failure, soft deadline and retry remain nonblocking', async () => {
  let count=0;
  const fail=()=>({
    set src(_) { count++; queueMicrotask(()=>this.onerror?.()); },
  });
  assert.equal(await preloadDecodedImage('/myst-fail.webp',{makeImage:fail}),false);
  assert.equal(await preloadDecodedImage('/myst-fail.webp',{makeImage:fail}),false);
  assert.equal(count,2);
  const never=()=>({set src(_) {}});
  const result=await prepareFirstView({budgetMs:20,makeImage:never});
  assert.deepEqual(result,{ready:false,timedOut:true});
});
test('slow networks limit near-viewport preloading', () => {
  assert.ok(isSlowConnection({effectiveType:'2g'}));
  assert.ok(isSlowConnection({saveData:true}));
  assert.equal(isSlowConnection({effectiveType:'4g'}),false);
  const makeImage=()=>({set src(_) { queueMicrotask(()=>this.onerror?.()); }});
  assert.equal(warmNearViewport(['a','b','c','d'],{saveData:true},{makeImage}).length,1);
  assert.equal(warmNearViewport(['e','f','g','h'],{effectiveType:'4g'},{makeImage}).length,3);
});
test('bootstrap and media state do not fake progress or block forever', () => {
  const loader=read('app/webapp/BootLoader.jsx');
  const webapp=read('app/webapp/WebAppClient.jsx');
  assert.match(loader,/role="status"/);
  assert.match(loader,/onRetry/);
  assert.match(webapp,/timeoutMs: 15000/);
  assert.match(webapp,/prepareFirstView/);
  assert.match(webapp,/RouteSkeleton/);
  assert.doesNotMatch(loader,/\b100%/);
  assert.match(loader,/data-text="MYST"/);
  assert.doesNotMatch(loader,/LineWobble|Quantum|TELEGRAM MINI APP/);
});
