import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluateBoard, resolveRps } from '../lib/pvpGames.mjs';
const read = (p) => readFileSync(new URL('../'+p, import.meta.url), 'utf8');

test('X/O resolves wins, draws and open rounds', () => {
  assert.equal(evaluateBoard(['X','X','X',null,'O',null,null,'O',null]).winner,'X');
  assert.deepEqual(evaluateBoard(['X','O','X','X','O','O','O','X','X']),{winner:'draw',line:[]});
  assert.equal(evaluateBoard(['X',null,null,null,null,null,null,null,null]),null);
});
test('rock-paper-scissors resolves both outcomes and ties', () => {
  for(const [a,b] of [['rock','scissors'],['paper','rock'],['scissors','paper']]) {
    assert.equal(resolveRps(a,b),0);
    assert.equal(resolveRps(b,a),1);
    assert.equal(resolveRps(a,a),-1);
  }
  assert.equal(resolveRps('unknown','rock'),null);
});
test('TGS gifts autoplay exactly once and user can switch animations off', () => {
  const src=read('app/webapp/WebAppClient.jsx');
  const settings=read('app/webapp/SettingsPanel.jsx');
  assert.match(src,/giftAnimations: stored\.giftAnimations !== false/);
  assert.match(src,/loop: false,\s+autoplay: true,\s+animationData/);
  assert.match(src,/animation\.addEventListener\('complete'/);
  assert.match(src,/animateOnEnter=\{index < 24\}/);
  assert.match(read('app/webapp/CaseDetailExperience.jsx'),/compact animateOnEnter/);
  assert.match(src,/play=\{false\}/);
  assert.match(settings,/Gift animatsiyalari/);
});
test('PvP opens a real local 1v1 hub instead of the old placeholder toast', () => {
  const src=read('app/webapp/WebAppClient.jsx');
  const pvp=read('app/webapp/PvpHub.jsx');
  assert.match(src,/onOpenPvp=\{\(\) => openPvpHub\('home'\)\}/);
  assert.match(src,/tab === 'pvp' \? <PvpHub/);
  assert.match(pvp,/TicTacToe/);
  assert.doesNotMatch(pvp,/Play\\. Compete\\./);
  assert.match(pvp,/RockPaperScissors/);
  assert.match(pvp,/ONLINE DUEL/);
});
