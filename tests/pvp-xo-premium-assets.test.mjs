import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('PVP uses standalone crisp SVG components instead of generic lucide board marks',()=>{
const jsx=read('app/webapp/PvpHub.jsx');const css=read('app/webapp/PvpHub.module.css');
for(const file of ['mark-x','mark-o','board-shell','cell-bezel','win-glint'])assert.match(read('public/pvp/xo/'+file+'.svg'),/<svg/);
assert.match(jsx,/src="\/pvp\/xo\/mark-x\.svg"/);assert.match(jsx,/src="\/pvp\/xo\/mark-o\.svg"/);
assert.match(css,/board-shell\.svg/);assert.match(css,/win-glint\.svg/);
assert.match(jsx,/onClick=\{onClick\}/);
});
