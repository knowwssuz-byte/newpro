/** Decorative reel only. Never determines which gift a player receives. */
const numeric = n => Number.isFinite(Number(n)) ? Number(n) : 0;
const available = g => g && g.is_active !== false && numeric(g.stock)>0;
const weight = g => numeric(g?.real_chance ?? g?.chance);
function uniquePool(gifts) {
 const seen=new Set();
 return (Array.isArray(gifts)?gifts:[]).filter(g=>{
  if(!available(g)||!g.id||seen.has(String(g.id)))return false;
  seen.add(String(g.id));return true;
 });
}
function randomGift(gifts,random){
 if(!gifts.length)return null;
 const value=Number(random());
 return gifts[Math.max(0,Math.min(gifts.length-1,Math.floor((Number.isFinite(value)?value:0)*gifts.length)))];
}
export function buildPresentationReel(gifts=[],serverWinner,random=Math.random){
 if(!serverWinner)return [];
 const pool=uniquePool(gifts);
 const possible=pool.filter(g=>weight(g)>0);
 const previews=pool.filter(g=>weight(g)===0);
 if(!possible.some(g=>String(g.id)===String(serverWinner.id)))possible.push(serverWinner);
 const reel=[];
 for(let i=0;i<48;i++)reel.push(randomGift(previews.length&&i%11===7?previews:possible,random));
 reel.push(serverWinner); // fixed, authorized winner, index 48
 for(let i=0;i<8;i++)reel.push(randomGift(previews.length&&i===5?previews:possible,random));
 return reel;
}
export function buildIdlePreviewStrip(gifts=[]){
 const pool=uniquePool(gifts),possible=pool.filter(g=>weight(g)>0),previews=pool.filter(g=>weight(g)===0);
 const main=possible.length?possible:previews;
 if(!main.length)return [];
 const strip=Array.from({length:11},(_,i)=>main[i%main.length]);
 if(possible.length&&previews.length)strip[7]=previews[0];
 return strip;
}
