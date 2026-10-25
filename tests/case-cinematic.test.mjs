import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
 REEL_PRE_WIN, REEL_POST_WIN, winningIndexOfReel, reelLandingDistance, cinematicReelKeyframes,
} from '../lib/caseReelMotion.mjs';
const read = (p) => readFileSync(new URL('../'+p, import.meta.url),'utf8');

test('the server-selected reward occupies the exact target slot', () => {
 const catalog = ['common','rare','epic'];
 const serverReward = {id:'server-authorized-win'};
 const reel=[...Array.from({length:REEL_PRE_WIN}, (_,i)=>catalog[i%catalog.length]),serverReward,...Array.from({length:REEL_POST_WIN},()=>catalog[0])];
 assert.strictEqual(reel[winningIndexOfReel(reel)],serverReward);
});
test('landing distance physically centers a card at 320/375/390/430/768/1024/1440px', () => {
 for (const width of [320,375,390,430,768,1024,1440]) {
  const left=2917, cardWidth=width<=430?82:88;
  const distance=reelLandingDistance({cardLeft:left,cardWidth,viewportWidth:width});
  assert.ok(Math.abs((left+cardWidth/2-distance)-(width/2))<0.0001);
 }
});
test('cinematic animation progresses without snaps and ends at exact offset',()=>{
 const start=180,end=3840;
 const frames=cinematicReelKeyframes(start,end);
 assert.equal(frames[0].offset,0);
 assert.equal(frames.at(-1).offset,1);
 const positions=frames.map(f=>Number(f.transform.match(/translate3d\((-?[\d.]+)px/)[1]));
 assert.equal(positions[0],-start);
 assert.equal(positions.at(-1),-end);
 assert.ok(positions.every((pos,i)=>i===0||pos<=positions[i-1]));
});
test('case opening keeps prices, rewards and transaction logic on the server',()=>{
 const client=read('app/webapp/WebAppClient.jsx');
 const api=read('app/api/open-case/route.js');
 assert.match(api,/open_case_atomic/);
 assert.match(client,/apiPost\('\/api\/open-case'/);
 assert.match(client,/result\.gift/);
 assert.match(client,/cinematicReelKeyframes/);
 assert.match(client,/CaseCinematicStage/);
 assert.match(client,/onRollComplete/);
});
