import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('case prize media and xp awards render distinct artwork',()=>{
 assert.match(read('public/rewards/stars-preview.svg'),/<svg/);
 assert.match(read('public/rewards/gift-preview.svg'),/<svg/);
 assert.match(read('public/rewards/xp-orb.svg'),/<svg/);
 assert.match(read('app/webapp/CaseOpening.module.css'),/data-reward-kind="xp"/);
 assert.match(read('app/webapp/CaseDetailExperience.jsx'),/LEVEL XP/);
 assert.match(read('lib/inventory.mjs'),/'xp'/);
});
