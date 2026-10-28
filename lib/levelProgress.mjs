export function levelProgress(xp=0) {
 const total=Math.max(0,Math.floor(Number(xp)||0));
 let level=Math.max(1,Math.floor((1+Math.sqrt(1+8*total/100))/2));
 while(50*level*(level-1)>total)level--;
 while(50*(level+1)*level<=total)level++;
 const current=total-50*level*(level-1);
 const needed=100*level;
 return {level,total,current,needed,remaining:needed-current,progress:Math.round(100*current/needed)};
}
