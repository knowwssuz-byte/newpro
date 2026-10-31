import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');

test('Home Arena and Upgrade are distinct working PVP and Upgrade navigation entries',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  const home=app.slice(app.indexOf('function HomeView('),app.indexOf('function CasesView('));
  assert.match(home,/data-quick-action="arena"/);
  assert.match(home,/onClick=\{onOpenPvp\}/);
  assert.match(home,/<strong>Arena<\/strong>/);
  assert.match(home,/data-quick-action="upgrade"/);
  assert.match(home,/onClick=\{onGoUpgrade\}/);
  assert.match(home,/<strong>Upgrade<\/strong>/);
  assert.match(app,/onOpenPvp=\{\(\) => openPvpHub\('home'\)\}/);
  assert.match(app,/tab === 'pvp' \? <PvpHub/);
  assert.match(app,/tab === 'upgrade' \?/);
  assert.doesNotMatch(home,/onClick=\{onGoCases\}/);
  assert.match(home,/id="case-collection"/);
});

test('Games is exclusive to Dice and PVP games appear only in the Arena route',()=>{
  const app=read('app/webapp/WebAppClient.jsx');
  const games=app.slice(app.indexOf('function CasesView('),app.indexOf('function CaseCard('));
  const pvp=read('app/webapp/PvpHub.jsx');
  assert.match(games,/<DiceLobbyCard onClick=\{onOpenDice\}/);
  assert.doesNotMatch(games,/<PvpEntryCard/);
  assert.doesNotMatch(app,/onOpenPvp=\{\(\) => openPvpHub\('games'\)\}/);
  assert.doesNotMatch(pvp.slice(pvp.lastIndexOf('return <section className=')),/setSelected\('rps'\)/);
  assert.match(pvp,/setSelected\('color'\)/);
  assert.match(pvp,/setSelected\('xo'\)/);
});

test('Only two Home shortcut cards receive rich 3D styles, with motion safety',()=>{
 const css=read('app/webapp/premium-polish.css');
 assert.match(css,/HOME SHORTCUTS V7/);
 assert.match(css,/data-quick-action="arena"/);
 assert.match(css,/data-quick-action="upgrade"/);
 assert.match(css,/inset 0 -4px 9px/);
 assert.match(css,/prefers-reduced-motion:reduce/);
});
