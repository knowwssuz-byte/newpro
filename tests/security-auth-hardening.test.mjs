import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin secret no longer persists indefinitely in localStorage',()=>{
 const s=r('app/admin/AdminClient.jsx');assert.match(s,/sessionStorage\.setItem\('gift_myst_admin_key'/);
 assert.doesNotMatch(s,/localStorage\.setItem\('gift_myst_admin_key'/);
});
test('auth secrets are timing-safe and DB internals are not returned to players',()=>{
 assert.match(r('app/api/browser-admin/route.js'),/timingSafeEqual/);
 assert.match(r('app/api/bot/route.js'),/timingSafeEqual/);
 assert.match(r('app/api/open-case/route.js'),/Case ochishda server xatosi/);
});
