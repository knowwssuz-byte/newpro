import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Inventory gift media persists when changing menus, including opening case details',()=>{
  const web=read('app/webapp/WebAppClient.jsx');
  assert.match(web,/inventoryVisited \|\| tab === 'inventory'/);
  assert.match(web,/data-inventory-keepalive="true"/);
  assert.match(web,/hidden=\{tab !== 'inventory' \|\| Boolean\(selectedCase\)\}/);
  assert.match(web,/style=\{tab !== 'inventory' \|\| selectedCase \? \{display:'none'\}/);
  assert.match(web,/<InventoryView[\s\S]*?active=\{tab === 'inventory' && !selectedCase\}/);
  assert.match(web,/useEffect\(\(\) => \{ if \(!active\) setDialog\(null\); \}, \[active\]\)/);
});

test('TGS gift preview remains visible until its first Lottie SVG frame is rendered',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  const css=read('app/globals.css');
  assert.match(app,/animation\.addEventListener\('DOMLoaded'/);
  assert.match(app,/setAnimationReady\(true\)/);
  assert.match(app,/const showPoster = !animate \|\| !animationReady \|\| failed/);
  assert.match(app,/style=\{\{visibility: animationReady && !failed \? 'visible' : 'hidden'\}\}/);
  assert.match(css,/\.gift-media\.tgs-gift-media > \.tgs-static-preview/);
  assert.match(css,/grid-area: 1 \/ 1/);
});

test('browser smoke checks actual animated gift identity across tab changes',()=>{
 const source=read('scripts/myst-visual-smoke.mjs');
 assert.match(source,/__giftMediaBeforeTabSwitch===document\.querySelector/);
 assert.match(source,/Visited Inventory must be hidden, not removed/);
});
