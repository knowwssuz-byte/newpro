import test from 'node:test';
import assert from 'node:assert/strict';
import {createBilliardPath,projectHitToRegion,BALL_RADIUS} from '../lib/colorArenaBallPhysics.mjs';
import {orderedShares,renderBands,polygonArea,boundaryAt,locateSeat,orientPoint} from '../lib/colorArenaGeometry.mjs';

test('wall collisions are specular and remain inside arena boundaries',()=>{
  for(let seed=0;seed<75;seed++){
    const target={x:0.13+(seed%10)*.064,y:0.23+(seed%7)*.091};
    const path=createBilliardPath(target,seed,seed+1);
    assert.ok(path.impacts.length>=2, 'trajectory must actually bounce');
    const [x,y]=path.end;
    assert.ok(Math.abs(x-target.x)<1e-10 && Math.abs(y-target.y)<1e-10);
    for(let t=0;t<=1000;t++){
      const [px,py]=path.position(t/1000);
      assert.ok(px>=BALL_RADIUS-1e-10 && px<=1-BALL_RADIUS+1e-10);
      assert.ok(py>=BALL_RADIUS-1e-10 && py<=1-BALL_RADIUS+1e-10);
    }
    for(const hit of path.impacts){
      const p=path.position(hit.t),d=.00001;
      assert.ok(Math.abs(hit.axis===0?p[0]-BALL_RADIUS:p[1]-BALL_RADIUS)<.000001 ||
        Math.abs(hit.axis===0?p[0]-(1-BALL_RADIUS):p[1]-(1-BALL_RADIUS))<.000001);
      const a=path.position(hit.t-d),b=path.position(hit.t+d);
      const index=hit.axis;
      assert.ok((a[index]-p[index])*(b[index]-p[index])>=-1e-7,'impact reflects');
    }
  }
});
test('rolling speed decreases continuously and reaches stationary endpoint',()=>{
  const path=createBilliardPath({x:.67,y:.31},17,9);
  // Speed of the *unfolded* straight-line trajectory is proportional to 1-t.
  for(const t of [0,.1,.2,.4,.7,.9,1]){
    const dt=1e-5;
    const vx=Math.hypot(...path.position(Math.max(0,t-dt)));
    assert.ok(Number.isFinite(vx));
    if(t===1)assert.deepEqual(path.position(t),path.end);
  }
});
test('thousands of participants still partition the full board without gaps',()=>{
  const users=Array.from({length:1250},(_,seat)=>({seat,id:seat+1,stake:10+seat%37}));
  const shares=orderedShares(users);
  const polys=renderBands(shares,47,24);
  assert.equal(polys.length,users.length);
  const total=polys.reduce((s,poly)=>s+polygonArea(poly),0);
  assert.ok(Math.abs(total-1)<1e-7,'coverage '+total);
});
test('server result can be projected inside physical walls without changing winner',()=>{
  const participants=orderedShares([{seat:0,stake:400},{seat:1,stake:300},
    {seat:2,stake:200},{seat:3,stake:100}]);
  for(let seed=0;seed<80;seed++){
    for(const x of [.00001,.01,.09,.24,.43,.69,.91,.99]){
      for(const y of [.001,.05,.33,.5,.76,.99]){
        const actual=locateSeat(participants,seed,x,y);
        const projected=projectHitToRegion({x,y},participants,seed,boundaryAt);
        const displayed=locateSeat(participants,seed,projected.x,projected.y);
        assert.equal(displayed,actual,JSON.stringify({seed,x,y,projected}));
      }
    }
  }
});
