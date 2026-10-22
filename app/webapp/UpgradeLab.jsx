'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, CheckCircle2, ChevronDown, Gift, RotateCcw, ShieldCheck, Sparkles, TrendingUp, XCircle, Zap } from 'lucide-react';
import StarIcon from './StarIcon';
import { getInventoryRows } from '@/lib/inventory.mjs';
import styles from './UpgradeLab.module.css';

const fmt = value => new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:0}).format(Number(value)||0);
function giftValue(gift) {
  const values=[gift?.sell_price, gift?.buy_price, gift?.floor_price, gift?.value];
  return Math.max(0,Number(values.find(v=>Number(v)>0))||0);
}
const demoGift = (gift, i) => ({
  id: String(gift?.id || 'practice-'+i),
  title: String(gift?.title || 'Myst Gift'),
  image_url: gift?.image_url || '',
  rarity: gift?.rarity || 'rare',
  price: Math.max(giftValue(gift),i===0?10:30),
});
const fallback = [
 {id:'demo-starter',title:'Crystal Drop',image_url:'',rarity:'rare',price:25},
 {id:'demo-prime',title:'Royal Emblem',image_url:'',rarity:'epic',price:65},
 {id:'demo-elite',title:'Eternal Prism',image_url:'',rarity:'legendary',price:180},
];
function PrizeArt({ item, size='normal' }) {
 return <div className={styles.prizeArt} data-size={size}>
  <div className={styles.orbit} aria-hidden="true"/>
  {item?.image_url ? <img src={item.image_url} alt="" loading="lazy" draggable="false" /> : <Gift size={size==='large'?72:40} strokeWidth={1.25} aria-hidden="true"/>}
 </div>;
}
export default function UpgradeLab({ onBack, history=[], inventoryGifts=[], catalogGifts=[], cases=[], withdrawals=[] }) {
 const owned = useMemo(() => getInventoryRows(history,inventoryGifts,cases,withdrawals)
   .map(({ item,gift })=>({ ...demoGift(gift,0), id:String(item.id),actual:true,price:Math.max(1,giftValue(gift)) })),[history,inventoryGifts,cases,withdrawals]);
 const catalog = useMemo(()=>{
   const found = (catalogGifts || []).filter(g=>g?.type!=='balance' && Number(g?.stock)>0 && giftValue(g)>0)
    .slice(0,50).map((g,i)=>demoGift(g,i));
   return [...found,...fallback].sort((a,b)=>a.price-b.price);
 },[catalogGifts]);
 const [selected,setSelected] = useState(null);
 const [target,setTarget] = useState(null);
 const [phase,setPhase] = useState('idle');
 const [success,setSuccess] = useState(false);
 const timeout = useRef(null);
 useEffect(()=>()=>{if(timeout.current)window.clearTimeout(timeout.current)},[]);
 const sources = owned.length ? owned : (catalog.length?catalog:fallback);
 const source = sources.find(s=>s.id===selected)||sources[0]||fallback[0];
 const targets = catalog.filter(item=>item.price>source.price*1.06 && item.id!==source.id);
 const goal = targets.find(item=>item.id===target)||targets[0]||fallback[2];
 const chance = Math.min(85,Math.max(8,Math.round((source.price/Math.max(goal.price,1))*80)));
 const [tab,setTab]=useState('source');
 function play() {
  if (phase==='rolling'||!goal || !source) return;
  setPhase('rolling');
  setSuccess(false);
  const result = Math.random() * 100 < chance; // Cosmetic demo only, not a monetary draw.
  if(timeout.current)window.clearTimeout(timeout.current);
  timeout.current=window.setTimeout(()=>{setSuccess(result);setPhase('result');timeout.current=null},3200);
 }
 function restart(){setPhase('idle');setSuccess(false)}
 return (
  <section className={styles.root}>
   <div className={styles.header}>
    <button type="button" onClick={onBack} className={styles.back} aria-label="Orqaga"><ArrowLeft size={20}/></button>
    <div><span>MYST LABS / GAME MODES</span><h1>Gift Upgrade</h1></div>
    <span className={styles.demo}>DEMO</span>
   </div>
   <div className={styles.hero}>
    <div className={styles.heroGlow} aria-hidden="true"/>
    <div className={styles.eyebrow}><Zap size={14}/> UPGRADE EXPERIENCE</div>
    <h2>Next level. <em>New possibilities.</em></h2>
    <p>Giftni tanlang, maqsadni belgilang va yangilanish animatsiyasini sinang.</p>
    <div className={styles.badge}><ShieldCheck size={15}/> Balans va haqiqiy sovg‘alar o‘zgarmaydi</div>
   </div>
   <div className={styles.selection}>
    <div className={styles.slot}>
     <div className={styles.slotTitle}><span>01</span><strong>YOUR GIFT</strong></div>
     <PrizeArt item={source}/>
     <strong className={styles.prizeName}>{source.title}</strong>
     <div className={styles.price}><StarIcon variant="balance" size={17}/>{fmt(source.price)}</div>
     <button disabled={phase==='rolling'} className={styles.choose} onClick={()=>setTab(tab==='source'?'':'source')} type="button">Sovg‘ani tanlash <ChevronDown size={15}/></button>
    </div>
    <span className={styles.exchange} aria-hidden="true"><ArrowRight size={22}/></span>
    <div className={styles.slot}>
     <div className={styles.slotTitle}><span>02</span><strong>TARGET GIFT</strong></div>
     <PrizeArt item={goal}/>
     <strong className={styles.prizeName}>{goal.title}</strong>
     <div className={styles.price}><StarIcon variant="balance" size={17}/>{fmt(goal.price)}</div>
     <button disabled={phase==='rolling'} className={styles.choose} onClick={()=>setTab(tab==='target'?'':'target')} type="button">Maqsadni tanlash <ChevronDown size={15}/></button>
    </div>
   </div>
   {tab ? <div className={styles.picker}>
     <div className={styles.pickerTop}><strong>{tab==='source'?'Sovg‘ani tanlang':'Yangilanadigan sovg‘ani tanlang'}</strong><small>{tab==='source' && !owned.length?'Demo giftlar':'Katalog'}</small></div>
     <div className={styles.pickerScroll}>
      {(tab==='source'?sources:targets).slice(0,24).map(item=>
       <button type="button" key={item.id} disabled={phase==='rolling'} className={styles.pick} onClick={()=>{if(tab==='source'){setSelected(item.id);setTarget(null)}else setTarget(item.id);setTab('');restart()}}>
        {item.image_url?<img src={item.image_url} alt="" loading="lazy"/>:<Gift size={22}/>}
        <span>{item.title}<small>{fmt(item.price)} ★</small></span>
       </button>
      )}
      {tab==='target' && !targets.length?<p className={styles.noTargets}>Hozir yuqoriroq qiymatdagi sovg‘alar mavjud emas.</p>:null}
     </div>
    </div>:null}
   <div className={styles.machine} data-phase={phase} aria-live="polite">
    <div className={styles.ring}>
     <svg viewBox="0 0 176 176" aria-hidden="true" className={styles.chanceRing}>
      <circle cx="88" cy="88" r="77" className={styles.ringTrack}/>
      <circle cx="88" cy="88" r="77" className={styles.ringProgress} style={{ '--chance': chance }}/>
     </svg>
     <div className={styles.ringCore}>
      {phase==='rolling'?<Sparkles size={31} className={styles.spinMark}/>:phase==='result'?(success?<CheckCircle2 size={38}/>:<XCircle size={38}/>):<><strong>{chance}%</strong><small>DEMO CHANCE</small></>}
     </div>
    </div>
    <div className={styles.machineText}>
     {phase==='idle'?<><h3>Upgrade lab tayyor</h3><p>Tanlangan sovg‘alar qiymatiga qarab demo imkoniyat ko‘rsatiladi.</p></>
      :phase==='rolling'?<><h3>Upgrade jarayoni</h3><p>Vizual natija hisoblanmoqda…</p></>
      :<><h3>{success?'Demo muvaffaqiyatli!':'Bu safar amalga oshmadi'}</h3><p>{success?`Demo natijasi: ${goal.title}`:'Hech qanday haqiqiy gift yoki Stars yo‘qotilmadi.'}</p></>}
    </div>
    {phase==='result'
      ?<button type="button" className={styles.action} onClick={restart}><RotateCcw size={18}/> Qayta urinib ko‘rish</button>
      :<button type="button" className={styles.action} disabled={phase==='rolling'||!targets.length} onClick={play}><Zap size={18}/>{phase==='rolling'?'ANIMATSIYA…':'UPGRADE DEMO'}<ArrowUpRight size={18}/></button>}
   </div>
   <p className={styles.disclaimer}>Bu xavfsiz namoyish rejimi: sovg‘a va Stars yechilmaydi, haqiqiy inventarga yutuq qo‘shilmaydi. Onlayn o‘yin yoki moddiy mukofotga bog‘lanmagan.</p>
  </section>
 );
}
