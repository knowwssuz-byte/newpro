// Shared deterministic geometry for arena draw and geometric tests.
// The i-th internal boundary is an integral-zero sine-wave perturbation of
// the cumulative stake fraction. Thus every band's *true* area equals its stake.
// Identical boundary arrays are reused on either side: no overlap or gaps.
export const ARENA_COLORS = ['#a678ff','#42e6e0','#ffba58','#ff6d9d','#84e886','#5ca8ff','#f590ff','#f5e279'];
export function orderedShares(participants = []) {
  const bets = [...participants].sort((a,b) => Number(a.seat)-Number(b.seat));
  const total = bets.reduce((s,b)=>s+Math.max(0,Number(b.stake)||0),0);
  return bets.map(b => ({...b, share: total>0 ? Math.max(0,Number(b.stake)||0)/total : 0}));
}
export function boundaryAt(shares, seed, index, y) {
  if (index<=0) return 0;
  if (index>=shares.length) return 1;
  const previous = shares.slice(0,index).reduce((s,item)=>s+item.share,0);
  const amplitude = Math.min(shares[index-1].share, shares[index].share)*0.12;
  const frequency = 1 + (Math.trunc(seed)%2);
  const phase = (Math.trunc(seed)%360)/360 + index*0.37;
  return previous + amplitude*Math.sin(2*Math.PI*(frequency*y+phase));
}
export function locateSeat(participants,seed,x,y) {
  if (!(x>=0&&x<1&&y>=0&&y<1)) return null;
  const bets=orderedShares(participants);
  for (let i=0;i<bets.length;i++)
    if (x<boundaryAt(bets,seed,i+1,y) || i===bets.length-1) return bets[i].seat;
  return null;
}
export function bandPolygon(shares,seed,i,steps=48) {
  const left=[],right=[];
  for (let j=0;j<=steps;j++){
    const y=j/steps;
    left.push([boundaryAt(shares,seed,i,y),y]);
    right.push([boundaryAt(shares,seed,i+1,y),y]);
  }
  return [...right,...left.reverse()];
}
export function polygonArea(points) {
  let area=0;
  for (let i=0;i<points.length;i++) {
    const [x,y]=points[i], [u,v]=points[(i+1)%points.length];
    area+=x*v-u*y;
  }
  return Math.abs(area)/2;
}
export function orientPoint(x,y,seed) {
  switch (Math.abs(Math.trunc(seed))%4){
    case 1: return [1-y,x];
    case 2: return [1-x,1-y];
    case 3: return [y,1-x];
    default: return [x,y];
  }
}
export function renderPolygon(shares,seed,i,steps=48) {
  return bandPolygon(shares,seed,i,steps).map(([x,y])=>orientPoint(x,y,seed));
}
export function labelPoint(shares,seed,i) {
  return orientPoint((boundaryAt(shares,seed,i,0.5)+boundaryAt(shares,seed,i+1,0.5))/2,0.5,seed);
}
