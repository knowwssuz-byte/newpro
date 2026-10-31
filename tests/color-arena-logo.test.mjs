import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Color Arena PNG replaces the former card cover and appears in the game header',()=>{
  const png=readFileSync(new URL('../public/pvp/color-arena-cover.png',import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=png.readUInt32BE(16), height=png.readUInt32BE(20);
  assert.equal(width,height);
  assert.ok(width>=128, 'Arena cover should be legible at mobile thumbnail size');
  const hub=read('app/webapp/PvpHub.jsx');
  const arena=read('app/webapp/ColorArena.jsx');
  const css=read('app/webapp/ColorArena.module.css');
  assert.ok(hub.includes('src="/pvp/color-arena-cover.png"'));
  assert.ok(arena.includes('src="/pvp/color-arena-cover.png"'));
  assert.ok(css.includes('.headerLogo {'));
  assert.ok(!hub.includes('src="/pvp/color-arena-cover.svg"'));
  assert.ok(!existsSync(new URL('../public/pvp/color-arena-cover.svg', import.meta.url)));
  assert.ok(!existsSync(new URL('../public/pvp/color-arena-clean-logo.png', import.meta.url)));
});
