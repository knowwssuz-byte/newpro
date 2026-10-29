// Deterministic damped billiards, independent of request timing / display FPS.
// Unfolding the square into mirrored tiles gives *exactly* the same positions
// as ideal frictional motion with specular reflection at each outer wall.
// No interior area boundary is a collision surface.
const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const fold=v=>{const t=((v%2)+2)%2;return t<=1?t:2-t;};
export const BALL_RADIUS=0.033;
export function projectHitToRegion(target, shares, seed, getBoundary) {
  const y=clamp(Number(target.y),BALL_RADIUS,1-BALL_RADIUS);
  const x=clamp(Number(target.x),0,1-Number.EPSILON);
  let seatIndex=shares.length-1;
  for(let i=0;i<shares.length;i++){
    if(x<getBoundary(shares,seed,i+1,target.y)){seatIndex=i;break;}
  }
  const left=getBoundary(shares,seed,seatIndex,y);
  const right=getBoundary(shares,seed,seatIndex+1,y);
  const min=Math.max(BALL_RADIUS,left+0.000001);
  const max=Math.min(1-BALL_RADIUS,right-0.000001);
  // Narrow strips cannot contain the entire sphere; center remains strictly
  // inside the authoritative winner region even when glow overlaps a neighbor.
  return {x:min<=max?clamp(x,min,max):(left+right)/2,y};
}
export function createBilliardPath(target, seed=0, round=1, radius=BALL_RADIUS) {
  const r=clamp(radius,0.005,0.08), span=1-2*r;
  const normalized=[target.x,target.y].map(v=>clamp((v-r)/span,0,1));
  const raw=(Math.abs(Math.trunc(seed))*131 + Math.abs(Math.trunc(round))*97)>>>0;
  const tx=normalized[0],ty=normalized[1];
  // The mirrored target encodes 2-4 impacts per axis, with varied direction.
  const xTurns=1+(raw%2),yTurns=1+(Math.floor(raw/7)%2);
  const endpoint=[
    (raw%3===0?-2*xTurns:2*xTurns)+(raw%5===0?-tx:tx),
    (raw%7===0?2*yTurns:-2*yTurns)+(raw%11===0?-ty:ty)
  ];
  const start=[0.5,0.5];
  const delta=[endpoint[0]-start[0],endpoint[1]-start[1]];
  const position=t=>{
    const u=clamp(t,0,1),s=2*u-u*u; // constant rolling resistance, v -> 0
    return [r+span*fold(start[0]+delta[0]*s),r+span*fold(start[1]+delta[1]*s)];
  };
  // Analytical wall-collision timestamps: when unfolded path crosses integer
  // tile boundaries. Velocity is reflected along exactly one wall normal.
  const impacts=[];
  for(let axis=0;axis<2;axis++){
    const lo=Math.min(start[axis],endpoint[axis]);
    const hi=Math.max(start[axis],endpoint[axis]);
    for(let boundary=Math.ceil(lo);boundary<hi;boundary++){
      const progress=(boundary-start[axis])/delta[axis];
      if(!(progress>0&&progress<1))continue;
      const time=1-Math.sqrt(1-progress);
      const hit=position(time);
      impacts.push({t:time,x:hit[0],y:hit[1],axis});
    }
  }
  impacts.sort((a,b)=>a.t-b.t);
  return {position,impacts,start:position(0),end:position(1),radius:r};
}
export function billiardVelocity(path,t,dt=1e-4) {
  const a=path.position(clamp(t-dt,0,1));
  const b=path.position(clamp(t+dt,0,1));
  return [(b[0]-a[0])/(2*dt),(b[1]-a[1])/(2*dt)];
}
