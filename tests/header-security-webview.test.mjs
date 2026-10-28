import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const r=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('profile badge constrained to top bar without hiding settings or balance',()=>{
const css=r('app/globals.css'),ring=r('app/webapp/LevelRing.module.css');
assert.match(css,/home-avatar-wrap\{flex:0 0 53px/);assert.match(ring,/\.compact\{--size:53px/);assert.match(css,/max-width:390px/);
});
test('bot setup rejects URL secrets and requires bearer POST',()=>{
const route=r('app/api/bot/setup/route.js');assert.match(route,/export async function GET\(\)/);assert.match(route,/export async function POST/);assert.doesNotMatch(route,/searchParams\.get\('secret'/);assert.match(route,/timingSafeEqual/);
});
test('Telegram WebView keeps input selection while suppressing media menus',()=>{
const g=r('app/webapp/TelegramInteractionGuard.jsx');
assert.match(g,/addEventListener\('contextmenu'/);assert.match(g,/input, textarea, select/);
});
