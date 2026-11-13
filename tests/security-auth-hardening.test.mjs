import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync}from'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('admin secrets never persist in browser storage or bearer headers',()=>{
 const s=r('app/admin/AdminClient.jsx');
 assert.doesNotMatch(s,/(?:localStorage|sessionStorage)\.setItem\('gift_myst_admin_key'/);
 assert.doesNotMatch(s,/Authorization:.*Bearer/);
 assert.match(s,/api\/admin\/session/);
});
test('auth secrets are timing-safe and DB internals are not returned to players',()=>{
 assert.match(r('lib/security/adminSession.js'),/timingSafeEqual/);
 assert.match(r('app/api/bot/route.js'),/timingSafeEqual/);
 assert.match(r('app/api/open-case/route.js'),/Case ochishda server xatosi/);
});
