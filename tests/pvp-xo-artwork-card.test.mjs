import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
const get=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('Generated X/O thumbnail exists as an actual compressed asset',()=>{
 const file=new URL('../public/feature/pvp-xo-card-hd.webp',import.meta.url);
 const bytes=readFileSync(file);
 assert.equal(bytes.toString('ascii',0,4),'RIFF');
 assert.equal(bytes.toString('ascii',8,12),'WEBP');
 assert.ok(statSync(file).size>200000);
});
test('Home PvP leads to game list and X/O image card, then live room flow',()=>{
 const jsx=get('app/webapp/PvpHub.jsx');
 const css=get('app/webapp/PvpHub.module.css');
 assert.match(jsx,/src="\/feature\/pvp-xo-card-hd\.webp"/);
 assert.match(jsx,/const \[selected,setSelected\]=useState\('list'\)/);
 assert.match(jsx,/setSelected\('xo'\)/);
 assert.match(jsx,/setSelected\('rps'\)/);
 assert.match(jsx,/onBack=\{\(\)=>setSelected\('list'\)\}/);
 assert.match(jsx,/Yaratilgan o‘yinlar/);
 assert.match(css,/\.xoPosterImage\{/);
 assert.match(css,/object-fit:contain/);
});

test('PvP gallery uses two large square app icons and minimal labels',()=>{
 const src=get('app/webapp/PvpHub.jsx');
 const styles=get('app/webapp/PvpHub.module.css');
 const catalog=src.slice(src.lastIndexOf('return <section className={`${styles.root} ${styles.catalogRoot}`}>'));
 assert.match(catalog,/className=\{styles\.storeGrid\}/);
 assert.match(catalog,/className=\{styles\.storeCover\}/);
 assert.match(catalog,/className=\{styles\.storeCoverImage\}/);
 assert.match(catalog,/styles\.rpsCover/);
 assert.match(catalog,/<strong>X\/O Duel<\/strong>/);
 assert.doesNotMatch(catalog,/Haqiqiy raqib · 5–50 Stars/);
 assert.doesNotMatch(catalog,/O‘YNASH MUMKIN/);
 assert.match(styles,/PvP gallery V6[\s\S]*?\.storeGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
 assert.match(styles,/\.storeCover\{[\s\S]*?aspect-ratio:1\/1/);
 assert.match(styles,/\.storeCoverImage\{[\s\S]*?object-fit:cover/);
 assert.match(styles,/\.entryIcon\{[\s\S]*?flex:0 0 83px/);
});

test('HD X/O source and large mobile icon do not apply blur',()=>{
 const jsx=get('app/webapp/PvpHub.jsx');
 const css=get('app/webapp/PvpHub.module.css');
 assert.match(jsx,/width=\{896\} height=\{896\}/);
 assert.match(css,/@media \(max-width: 585px\)\s*\{[\s\S]*?\.storeGrid\s*\{\s*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
 assert.match(css,/\.storeItem\s*\{[\s\S]*?max-width:\s*none/);
 assert.match(css,/\.storeCoverImage\{[\s\S]*?filter:none/);
 assert.match(css,/\.entryIcon\{[\s\S]*?flex:0 0 99px/);
 assert.doesNotMatch(jsx,/src="\/feature\/pvp-xo-card\.webp"/);
});

test('two cards remain side by side even on very narrow phones',()=>{
 const css=get('app/webapp/PvpHub.module.css');
 const final=css.slice(css.lastIndexOf('/* PvP gallery V6'));
 assert.match(final,/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
 assert.doesNotMatch(final,/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
 assert.match(final,/@media \(max-width: 390px\)/);
 assert.match(final,/@media \(max-width: 340px\)/);
 assert.match(final,/aspect-ratio:\s*1\s*\/\s*1/);
});
