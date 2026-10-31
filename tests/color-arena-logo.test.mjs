import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');

test('Color Arena ships a detailed PNG to the selection card and in-game header',()=>{
  const p=new URL('../public/pvp/color-arena-cover-v2.png',import.meta.url);
  const bytes=readFileSync(p);
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(bytes.readUInt32BE(16),512);
  assert.equal(bytes.readUInt32BE(20),512);
  assert.ok(bytes.byteLength>60000,'unexpectedly tiny low-detail PNG');
  assert.ok(!existsSync(new URL('../public/pvp/color-arena-cover.png',import.meta.url)));
  const hub=read('app/webapp/PvpHub.jsx');
  const arena=read('app/webapp/ColorArena.jsx');
  const css=read('app/webapp/PvpHub.module.css');
  assert.match(hub,/src="\/pvp\/color-arena-cover-v2\.png"/);
  assert.match(hub,/width=\{512\} height=\{512\}/);
  assert.match(hub,/styles\.arenaCover/);
  assert.match(arena,/src="\/pvp\/color-arena-cover-v2\.png"/);
  assert.match(css,/\.arenaCover \.storeCoverImage/);
});
