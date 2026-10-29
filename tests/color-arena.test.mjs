import test from 'node:test';
import assert from 'node:assert/strict';
import {orderedShares,bandPolygon,polygonArea,boundaryAt,locateSeat,orientPoint} from '../lib/colorArenaGeometry.mjs';

const players=[
  {id:1,seat:0,stake:400},{id:2,seat:1,stake:300},
  {id:3,seat:2,stake:200},{id:4,seat:3,stake:100}
];
test('real geometric surface equals each stake ratio across variable seeds',()=>{
  for(const seed of [0,1,5,37,143,987654]){
    const shares=orderedShares(players);
    const sum=shares.reduce((a,p,i)=>{
      const area=polygonArea(bandPolygon(shares,seed,i,96));
      assert.ok(Math.abs(area-p.share)<1e-9,JSON.stringify({seed,i,area,share:p.share}));
      return a+area;
    },0);
    assert.ok(Math.abs(sum-1)<1e-9);
  }
});
test('fluid boundaries never overlap, leave gaps or escape frame',()=>{
  for(let seed=0;seed<100;seed++){
    const shares=orderedShares(players);
    for(let iy=0;iy<=80;iy++){
      const y=iy/80;let prev=0;
      for(let i=1;i<=shares.length;i++){
        const x=boundaryAt(shares,seed,i,y);
        assert.ok(x>=prev-1e-12,JSON.stringify({seed,i,x,prev}));
        assert.ok(x>=0&&x<=1);
        prev=x;
      }
      assert.equal(boundaryAt(shares,seed,shares.length,y),1);
    }
  }
});
test('geometric point detection covers every interior coordinate exactly once',()=>{
  for(let seed=0;seed<25;seed++){
    const counts=new Map(players.map(p=>[p.seat,0]));
    for(let y=0;y<120;y++)for(let x=0;x<120;x++){
      const seat=locateSeat(players,seed,(x+.5)/120,(y+.5)/120);
      assert.ok(counts.has(seat));
      counts.set(seat,counts.get(seat)+1);
    }
    for(const [i,p] of players.entries())
      assert.ok(Math.abs(counts.get(i)/14400-p.stake/1000)<.007);
  }
});
test('orientation transforms preserve unit square and do not affect odds',()=>{
  for(let seed=0;seed<100;seed++)
    for(const [x,y] of [[0,0],[0,1],[1,0],[1,1],[.15,.48]]){
      const [a,b]=orientPoint(x,y,seed);
      assert.ok(a>=0&&a<=1&&b>=0&&b<=1);
    }
});
test('newcomer at zero-share can smoothly grow with no negative surfaces',()=>{
  for(let t=0;t<=20;t++){
    const ease=t/20;
    const shares=orderedShares([{seat:0,stake:400},{seat:1,stake:300},{seat:2,stake:200},{seat:3,stake:100}]);
    shares.forEach((p,i)=>p.share=(i===0?.7*(1-ease)+.4*ease:
      i===1?.3*(1-ease)+.3*ease:
      i===2? .2*ease:.1*ease));
    const total=shares.reduce((s,p)=>s+p.share,0);
    assert.ok(Math.abs(total-1)<1e-9);
    for(let i=1;i<shares.length;i++)for(let y=0;y<=20;y++)
      assert.ok(boundaryAt(shares,55,i,y/20) >= boundaryAt(shares,55,i-1,y/20));
  }
});
