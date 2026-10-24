import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { didWheelLandInSafeZone, planUpgradeSpin, upgradeChance } from '../lib/upgradeLab.mjs';

const artRoot = join(process.cwd(),'public','feature','upgrade','art');

test('AI mechanical assets exist as optimized WebP binaries', () => {
  for (const asset of ['frame-metal.webp','hub-emblem.webp','pointer-gold.webp']) {
    const file = join(artRoot,asset);
    const data = readFileSync(file);
    assert.ok(statSync(file).size >= 2500, asset+' too small');
    assert.equal(data.toString('ascii',0,4),'RIFF',asset+' missing RIFF');
    assert.equal(data.toString('ascii',8,12),'WEBP',asset+' missing WebP marker');
  }
});

test('server-selected outcome and visual safe zone agree throughout range', () => {
  for (const chance of [.01,.1,1,5,12.5,25,41,50,77.12,85]) {
    for (const randomValue of [0,.1,.25,.5,.75,.999999]) {
      for (const won of [true,false]) {
        const plan=planUpgradeSpin({chance,previousRotation:1337,pointerDeg:180,win:won,randomValue});
        assert.equal(didWheelLandInSafeZone(chance,plan.endRotation,180),won);
      }
    }
  }
});

test('UI uses independent AI assets and keeps a user-visible accurate chance',()=>{
  const component = readFileSync(join(process.cwd(),'app','webapp','UpgradeLab.jsx'),'utf8');
  assert.ok(component.includes('frame-metal.webp'));
  assert.ok(component.includes('pointer-gold.webp'));
  assert.ok(component.includes('hub-emblem.webp'));
  assert.ok(component.includes('chanceText(chance)'));
  assert.ok(component.includes('planUpgradeSpin'));
  assert.ok(component.includes('/api/upgrade'));
});

test('mobile, tablet and desktop layout breakpoints exist',()=>{
  const css=readFileSync(join(process.cwd(),'app','webapp','UpgradeLab.module.css'),'utf8');
  for(const bp of ['960px','959px','440px','350px']) assert.ok(css.includes(bp),bp);
  assert.ok(css.includes('env(safe-area-inset-bottom'));
});

test('cost ratio is priced by existing rules', () => {
  assert.equal(upgradeChance({price:20},{price:40}),41);
});
