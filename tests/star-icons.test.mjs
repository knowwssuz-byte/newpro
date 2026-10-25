import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('balance retains Telegram currency art, non-balance usage has distinct sourced SVGs',()=>{
const component=read('app/webapp/StarIcon.jsx');
assert.match(component,/\/currency\/stars\.png/);
for(const part of ['star-badge-tabler','stars-cluster-tabler','stars-outline-tabler','stars-sparkles-tabler']){
 assert.match(component,new RegExp(part));
 const path='public/currency/'+part+'.svg';
 assert.ok(existsSync(new URL('../'+path,import.meta.url)));
 assert.match(read(path),/<svg[\s>]/);
}
});
test('Rocket preserves LDRS and loader has minimal MYST wordmark',()=>{
 for(const n of ['Quantum','Helix','LineWobble']){
  assert.match(read('app/webapp/vendor/'+n+'.jsx'),/UIBall LDRS/);
  assert.ok(existsSync(new URL('../app/webapp/vendor/'+n+'.module.css',import.meta.url)));
 }
 assert.match(read('app/webapp/BootLoader.jsx'), /styles\.wordmark/);
 assert.doesNotMatch(read('app/webapp/BootLoader.jsx'), /<Quantum|POWERED BY|SECURE MINI APP/);
 assert.match(read('app/webapp/RocketGame.jsx'),/<Helix/);
});
