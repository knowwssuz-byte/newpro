import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');

test('Color Arena PNG replaces the former card cover and appears in the game header',()=>{
  const png=readFileSync(new URL('../public/pvp/color-arena-clean-logo.png',import.meta.url));
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16),256);
  assert.equal(png.readUInt32BE(20),256);
  const hub=read('app/webapp/PvpHub.jsx');
  const arena=read('app/webapp/ColorArena.jsx');
  const css=read('app/webapp/ColorArena.module.css');
  assert.ok(hub.includes('src="/pvp/color-arena-clean-logo.png"'));
  assert.ok(arena.includes('src="/pvp/color-arena-clean-logo.png"'));
  assert.ok(css.includes('.headerLogo {'));
  assert.ok(!hub.includes('src="/pvp/color-arena-cover.svg"'));
});
