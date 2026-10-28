import test from 'node:test';import assert from 'node:assert/strict';import {levelProgress} from '../lib/levelProgress.mjs';import {readFileSync} from 'node:fs';
test('level ring math and visible app avatar',()=>{
 assert.equal(levelProgress(0).level,1);assert.equal(levelProgress(99).level,1);
 assert.equal(levelProgress(100).level,2);assert.equal(levelProgress(300).level,3);
 assert.equal(levelProgress(50).progress,50);
 const web=readFileSync(new URL('../app/webapp/WebAppClient.jsx',import.meta.url),'utf8');
 assert.match(web,/LevelRing xp=\{profile\?\.level_xp/);
 assert.match(web,/level_xp: completed\.userXp/);
});
