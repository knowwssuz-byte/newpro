// Case gift collection visual order only. Does not change lottery odds/reel.
export function casePrizeValue(gift) {
 const positive=value=>{const n=Number(value);return Number.isFinite(n)&&n>0?n:0;};
 if(gift?.type==='balance')return positive(gift?.value);
 return positive(gift?.floor_price)||positive(gift?.sell_price)||
   positive(gift?.buy_price)||positive(gift?.price)||positive(gift?.value);
}
export function sortCasePrizesHighToLow(prizes=[]) {
 return [...prizes].sort((a,b)=>casePrizeValue(b)-casePrizeValue(a)||
   String(a?.title||'').localeCompare(String(b?.title||''))||
   String(a?.id||'').localeCompare(String(b?.id||'')));
}
