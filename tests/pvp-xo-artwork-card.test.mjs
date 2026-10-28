import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Generated X/O thumbnail exists as an actual compressed asset',()=>{
 const file=new URL('../public/feature/pvp-xo-card.webp',import.meta.url);
 const bytes=readFileSync(file);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.ok(statSync(file).size>1500);
});
test('Home PvP leads to game list and X/O image card, then live room flow',()=>{
 const jsx=get('app/webapp/PvpHub.jsx');
 const css=get('app/webapp/PvpHub.module.css');
 assert.match(jsx,/src="\/feature\/pvp-xo-card\.webp"/);
 assert.match(jsx,/const \[selected,setSelected\]=useState\('list'\)/);
 assert.match(jsx,/setSelected\('xo'\)/);
 assert.match(jsx,/setSelected\('rps'\)/);
 assert.match(jsx,/onBack=\{\(\)=>setSelected\('list'\)\}/);
 assert.match(jsx,/Yaratilgan o‘yinlar/);
 assert.match(css,/\.xoPosterImage\{/);
 assert.match(css,/object-fit:contain/);
});
