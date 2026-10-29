import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBilliardPath,ringRotation,projectHitToRegion,BALL_RADIUS}
  from '../lib/colorArenaBallPhysics.mjs';
import {orderedShares,locateSeat,boundaryAt,orientPoint}
  from '../lib/colorArenaGeometry.mjs';
import {createArenaAudio} from '../lib/colorArenaAudio.mjs';

const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('crosshair ring bounces many times yet stops exactly at a known authoritative endpoint',()=>{
  for(let seed=0;seed<125;seed++){
    const target={x:.11+(seed%13)*.053,y:.12+(seed%11)*.067};
    const path=createBilliardPath(target,seed,seed+1);
    assert.ok(path.impacts.length>=7,'must rebound repeatedly: '+seed);
    assert.ok(Math.abs(path.end[0]-target.x)<1e-9);
    assert.ok(Math.abs(path.end[1]-target.y)<1e-9);
    for(let i=0;i<=200;i++){
      const [x,y]=path.position(i/200);
      assert.ok(x>=BALL_RADIUS-1e-9&&x<=1-BALL_RADIUS+1e-9);
      assert.ok(y>=BALL_RADIUS-1e-9&&y<=1-BALL_RADIUS+1e-9);
    }
    assert.equal(path.position(1)[0],path.end[0]);
    assert.ok(path.impacts.every((hit,i,a)=>i===0||a[i-1].t<=hit.t));
    assert.ok(ringRotation(1,seed)/360>=6);
    assert.ok(ringRotation(1,seed)/360<=9);
  }
});
test('winner remains unchanged after collision-safe repositioning of ring center',()=>{
  const shares=orderedShares(Array.from({length:7},(_,seat)=>({
    seat,stake:(seat+1)*100,id:seat+100
  })));
  for(let seed=0;seed<60;seed++){
    for(let x=0;x<1;x+=.041)for(let y=0;y<1;y+=.063){
      const a=locateSeat(shares,seed,x,y);
      const target=projectHitToRegion({x,y},shares,seed,boundaryAt);
      assert.equal(locateSeat(shares,seed,target.x,target.y),a);
      const p=orientPoint(target.x,target.y,seed);
      assert.ok(p.every(z=>z>=0&&z<=1));
    }
  }
});
test('arena rendering keeps server result and audio separate from money accounting',()=>{
  const ui=read('app/webapp/ColorArena.jsx');
  const api=read('app/api/color-arena/route.js');
  const styles=read('app/webapp/ColorArena.module.css');
  assert.match(ui,/className=\{styles\.ring\}/);
  assert.match(ui,/className=\{styles\.ringCross\}/);
  assert.match(ui,/styles\.ringDot/);
  assert.match(ui,/className=\{styles\.winStrip\}/);
  assert.match(ui,/ringRotation\(t,seed\)/);
  assert.match(ui,/createArenaAudio\(\)/);
  assert.match(ui,/onClick=\{toggleSound\}/);
  assert.match(ui,/Number\(previous\.version\)>=Number\(data\.room\.version\)/);
  assert.match(styles,/\.ringCross:before,\.ringCross:after/);
  assert.match(api,/isMe:String\(v\.id\)===String\(userId\)/);
  assert.doesNotMatch(api,/isMe:String\(v\.user_id\)/);
  assert.match(api,/\.from\('users'\)\.select\('balance'\)/);
  assert.match(api,/\.rpc\('color_arena_finish'/);
});
test('audio is inert and safe without browser APIs',()=>{
  const audio=createArenaAudio();
  assert.equal(audio.unlock(),false);
  assert.doesNotThrow(()=>audio.impact(1));
  assert.doesNotThrow(()=>audio.startRoll());
  assert.doesNotThrow(()=>audio.win());
  audio.setMuted(true);
  assert.doesNotThrow(()=>audio.dispose());
});
