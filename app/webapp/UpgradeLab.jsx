'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpDown, CheckCircle2, ChevronDown, Info,
  RotateCcw, Search, ShieldCheck, Sparkles, Volume2, VolumeX, X, Zap,
} from 'lucide-react';
import { getInventoryRows } from '@/lib/inventory.mjs';
import {
  normalizeUpgradeGift, upgradeChance, planUpgradeSpin, didWheelLandInSafeZone,
} from '@/lib/upgradeLab.mjs';
import { upgradeSound } from './upgradeAudio';
import { UpgradeGiftThumb } from './UpgradeGiftThumb';
import StarIcon from './StarIcon';
import styles from './UpgradeLab.module.css';

const SPIN_MS = 4600;
const POINTER_DEG = 180;
const fmt = (value) => new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:0}).format(Number(value)||0);

function ChevronMark({small=false}) {
  return <span className={small ? styles.markSmall : styles.mark} aria-hidden="true"><i/><i/></span>;
}

function GiftPicker({ mode, gifts, activeId, onChoose, onClose, sourceMode, onSourceMode, ownedCount }) {
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('asc');
  useEffect(()=>{
    const key = e => { if(e.key==='Escape') onClose(); };
    document.addEventListener('keydown',key);
    return ()=>document.removeEventListener('keydown',key);
  },[onClose]);
  const list=useMemo(()=>{
    const q=query.trim().toLocaleLowerCase();
    return gifts.filter(item=>!q || item.title.toLocaleLowerCase().includes(q))
      .sort((a,b)=>sort==='asc' ? a.price-b.price : b.price-a.price);
  },[gifts,query,sort]);
  return <div className={styles.backdrop} onMouseDown={e=>{if(e.currentTarget===e.target)onClose()}}>
    <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={mode==='source'?'Beriladigan sovg‘ani tanlash':'Olinadigan sovg‘ani tanlash'}>
      <div className={styles.sheetHandle} aria-hidden="true"/>
      <div className={styles.sheetHead}>
        <div><small>{mode==='source'?'YOUR ITEMS':'TARGET ITEM'}</small><h2>{mode==='source'?'Beradigan sovg‘a':'Oladigan sovg‘a'}</h2></div>
        <button type="button" onClick={onClose} aria-label="Yopish"><X size={18}/></button>
      </div>
      {mode==='source' ? <div className={styles.tabs}>
        <button type="button" data-active={sourceMode==='mine'} disabled={!ownedCount} onClick={()=>onSourceMode('mine')}>Inventar ({ownedCount})</button>
        <button type="button" data-active={sourceMode==='catalog'} onClick={()=>onSourceMode('catalog')}>Demo katalog</button>
      </div>:null}
      <div className={styles.searchRow}>
        <label className={styles.searchField}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Sovg‘a nomini yozing" aria-label="Gift qidirish"/></label>
        <button type="button" onClick={()=>setSort(s=>s==='asc'?'desc':'asc')} className={styles.sortButton} aria-label="Narx bo‘yicha tartiblash"><ArrowUpDown size={15}/><span>{sort==='asc'?'Arzon':'Qimmat'}</span></button>
      </div>
      <p className={styles.resultCount}>{list.length} ta sovg‘a</p>
      <div className={styles.pickerList}>
        {list.map(item=><button type="button" key={item.id} className={styles.pickRow} data-active={item.id===activeId} onClick={()=>onChoose(item)}>
          <span className={styles.pickThumb}><UpgradeGiftThumb item={item} alt=""/></span>
          <span className={styles.pickText}><strong>{item.title}</strong><small>{item.owned?'Sizning sovg‘angiz':'Demo katalog'}</small></span>
          <span className={styles.pickPrice}><StarIcon variant="gold" size={14}/>{fmt(item.price)}</span>
        </button>)}
        {!list.length ? <div className={styles.emptyResult}>Sovg‘a topilmadi</div>:null}
      </div>
      <p className={styles.pickerFoot}>Demo rejimida balans va real sovg‘alar o‘zgarmaydi.</p>
    </section>
  </div>;
}

function ItemCard({ item, label, subtitle, onClick, disabled=false, side }) {
  return <button type="button" className={styles.itemCard} data-side={side} onClick={onClick} disabled={disabled} aria-label={label+' tanlash'}>
    <div className={styles.itemTitle}><strong>{label}</strong><small>{subtitle}</small></div>
    <div className={styles.itemVisual}>
      <div className={styles.itemSpotlight} aria-hidden="true"/>
      {item?<div className={styles.giftThumb}><UpgradeGiftThumb item={item} alt={item.title} priority/></div>:
        <div className={styles.emptyArt}><ChevronMark/></div>}
    </div>
    <div className={styles.itemDetails}>
      <strong>{item?.title||'Sovg‘a tanlang'}</strong>
      <span className={styles.itemPrice}>{item?<><StarIcon variant="gold" size={15}/>{fmt(item.price)}</>:'—'}</span>
    </div>
    <span className={styles.changeItem}>{item?'Almashtirish':'Tanlash'} <ChevronDown size={14}/></span>
  </button>;
}

function UpgradeWheel({ chance, rotation, rolling, reduceMotion, onRest }) {
  const arc=Math.max(0,Math.min(100,chance))*3.6;
  const style={'--win-angle':arc+'deg',transform:'rotate('+rotation+'deg)'};
  return <div className={styles.wheelFrame} data-rolling={rolling}>
    <div className={styles.wheelHalo} aria-hidden="true"/>
    <div className={styles.wheelDisc} style={style} onTransitionEnd={e=>{if(e.propertyName==='transform')onRest()}}>
      <div className={styles.wheelGloss} aria-hidden="true"/>
      <div className={styles.wheelTicks} aria-hidden="true"/>
      <div className={styles.wheelBezel} aria-hidden="true"/>
    </div>
    <div className={styles.wheelCenter}><ChevronMark/></div>
    <div className={styles.wheelNeedle} aria-hidden="true"><span/></div>
    {reduceMotion?<span className={styles.srOnly}>Harakat kamaytirilgan</span>:null}
  </div>;
}

export default function UpgradeLab({onBack,history=[],inventoryGifts=[],catalogGifts=[],cases=[],withdrawals=[]}) {
  const owned=useMemo(()=>getInventoryRows(history,inventoryGifts,cases,withdrawals)
    .map(({item,gift})=>normalizeUpgradeGift(gift,item.id)).filter(Boolean),
    [history,inventoryGifts,cases,withdrawals]);
  const catalog=useMemo(()=>catalogGifts.filter(g=>g?.is_active!==false&&Number(g?.stock)>0)
    .map(g=>normalizeUpgradeGift(g)).filter(Boolean).sort((a,b)=>a.price-b.price),
    [catalogGifts]);
  const [sourceMode,setSourceMode]=useState(owned.length?'mine':'catalog');
  const [sourceId,setSourceId]=useState(null);
  const [targetId,setTargetId]=useState(null);
  const [picker,setPicker]=useState(null);
  const [phase,setPhase]=useState('idle');
  const [won,setWon]=useState(false);
  const [rotation,setRotation]=useState(0);
  const [plays,setPlays]=useState(0);
  const [wins,setWins]=useState(0);
  const [soundEnabled,setSoundEnabled]=useState(true);
  const [reduceMotion,setReduceMotion]=useState(false);
  const [error,setError]=useState('');
  const rotationRef=useRef(0);
  const runningRef=useRef(false);
  const planRef=useRef(null);
  const fallbackTimer=useRef(null);
  const confettiRef=useRef(null);
  const fxEngine=useRef(null);

  const sources=sourceMode==='mine' && owned.length ? owned : catalog;
  const source=sources.find(item=>item.id===sourceId)||sources[0]||null;
  const targets=useMemo(()=>source?catalog.filter(item=>item.price>source.price&&item.catalogId!==source.catalogId):[],[source,catalog]);
  const goal=targets.find(item=>item.id===targetId)||targets[0]||null;
  const chance=upgradeChance(source,goal);
  const multiplier=source&&goal?goal.price/source.price:0;

  useEffect(()=>{
    const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    try{const saved=localStorage.getItem('myst-upgrade-sounds');if(saved!==null)setSoundEnabled(saved!=='off')}catch{}
    return ()=>{if(fallbackTimer.current)clearTimeout(fallbackTimer.current);fxEngine.current?.reset?.()};
  },[]);

  const changeSound=()=>{
    setSoundEnabled(value=>{const next=!value;try{localStorage.setItem('myst-upgrade-sounds',next?'on':'off')}catch{}return next});
  };

  const celebrate=useCallback(async()=>{
    if(reduceMotion||!confettiRef.current)return;
    try{
      if(!fxEngine.current){
        const vendor=await import('./vendor/confetti-esm.js');
        if(!confettiRef.current)return;
        fxEngine.current=vendor.default.create(confettiRef.current,{resize:true,useWorker:false});
      }
      fxEngine.current({particleCount:95,spread:90,startVelocity:29,gravity:.85,scalar:.8,
        colors:['#ffde23','#ffffff','#ffd06b','#ff9018'],origin:{x:.5,y:.56}});
    }catch{}
  },[reduceMotion]);

  const finishSpin=useCallback(()=>{
    if(!runningRef.current||!planRef.current)return;
    if(fallbackTimer.current){clearTimeout(fallbackTimer.current);fallbackTimer.current=null}
    const landing=planRef.current;
    // Result is read from the actual displayed wheel stop angle; never reroll at finish.
    const isWin=didWheelLandInSafeZone(landing.chance, landing.endRotation, POINTER_DEG);
    runningRef.current=false;
    planRef.current=null;
    setWon(isWin);setPhase('result');setPlays(n=>n+1);
    if(isWin){setWins(n=>n+1);celebrate()}
    upgradeSound(isWin?'win':'miss',landing.soundEnabled);
  },[celebrate]);

  const spin=()=>{
    if(runningRef.current||!source||!goal||chance<=0)return;
    const willWin=Math.random()*100<chance;
    const landing=planUpgradeSpin({chance,previousRotation:rotationRef.current,
      pointerDeg:POINTER_DEG,win:willWin,randomValue:Math.random()});
    if(didWheelLandInSafeZone(chance,landing.endRotation,POINTER_DEG)!==willWin){
      setError('Baraban hisobida xatolik aniqlandi. Qayta urinib ko‘ring.');
      return;
    }
    setError('');runningRef.current=true;
    planRef.current={...landing,chance,soundEnabled};
    rotationRef.current=landing.endRotation;
    setWon(false);setPhase('rolling');
    setRotation(landing.endRotation);
    upgradeSound('start',soundEnabled);
    if(fallbackTimer.current)clearTimeout(fallbackTimer.current);
    fallbackTimer.current=setTimeout(finishSpin,reduceMotion?100:SPIN_MS+300);
  };

  const chooseGift=item=>{
    if(runningRef.current)return;
    if(picker==='source'){setSourceId(item.id);setTargetId(null)}
    else setTargetId(item.id);
    setPhase('idle');setPicker(null);
  };
  const switchMode=mode=>{
    if(runningRef.current)return;
    setSourceMode(mode);setSourceId(null);setTargetId(null);setPhase('idle');
  };
  const openPicker=mode=>{if(!runningRef.current)setPicker(mode)};

  return <section className={styles.root}>
    <div className={styles.header}>
      <button type="button" onClick={onBack} className={styles.back} aria-label="Orqaga"><ArrowLeft size={19}/></button>
      <ChevronMark small/>
      <div className={styles.headerTitle}><strong>UPGRADE</strong><small>NEWPRO / DEMO</small></div>
      <span className={styles.headerMode}><ShieldCheck size={13}/> DEMO</span>
      <button type="button" onClick={changeSound} className={styles.soundButton}
        aria-label={soundEnabled?'Ovozni o‘chirish':'Ovozni yoqish'} title={soundEnabled?'Ovozni o‘chirish':'Ovozni yoqish'}>
        {soundEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>}
      </button>
    </div>

    <div className={styles.stage} data-phase={phase} data-win={phase==='result'&&won}>
      <canvas ref={confettiRef} className={styles.confetti} aria-hidden="true"/>
      <div className={styles.wheelSection}>
        <div className={styles.wheelCaption}><span className={styles.microTitle}>UPGRADE WHEEL</span><span><Zap size={13}/> PRECISION SPIN</span></div>
        <UpgradeWheel chance={chance} rotation={rotation} rolling={phase==='rolling'} reduceMotion={reduceMotion} onRest={finishSpin}/>
        <div className={styles.chanceLine}>
          <span>WIN CHANCE</span>
          <strong>{chance.toFixed(1)}%</strong>
          <span>{source&&goal?fmt(source.price)+' → '+fmt(goal.price):'SOVG‘A TANLANG'}</span>
        </div>
      </div>

      <div className={styles.cards}>
        <ItemCard side="source" label="Beradigan sovg‘a" subtitle="Select items to use" item={source}
          disabled={phase==='rolling'} onClick={()=>openPicker('source')}/>
        <ItemCard side="target" label="Oladigan sovg‘a" subtitle="Select item for upgrade" item={goal}
          disabled={phase==='rolling'||!targets.length} onClick={()=>openPicker('target')}/>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.improve} disabled={!source||!goal||phase==='rolling'||chance<=0} onClick={spin}>
          {phase==='rolling'?<RotateCcw size={19} className={styles.spinIcon}/>:<ChevronMark small/>}
          <strong>{phase==='rolling'?'UPGRADING…':phase==='result'?'TRY AGAIN':'IMPROVE'}</strong>
        </button>
        {error?<p role="alert" className={styles.error}>{error}</p>:null}
        <div className={styles.status} role="status" aria-live="polite" data-state={phase==='result'?(won?'won':'lost'):phase}>
          <span>{phase==='rolling'?'Aylanmoqda…':phase==='result'?(won?'Demo muvaffaqiyatli!':'Bu safar muvaffaqiyatsiz'):'G‘ildirak ishga tayyor'}</span>
          <span>{wins} / {plays} <Sparkles size={13}/></span>
        </div>
        {phase==='result'&&won?<div className={styles.winnerLine}><CheckCircle2 size={17}/> {goal?.title} — faqat demo natijasi</div>:null}
        <div className={styles.footnote}><Info size={14}/>
          <span>{multiplier?multiplier.toFixed(2)+'× · ':''}Bu demo: Stars yechilmaydi, real sovg‘a inventarga qo‘shilmaydi.</span>
        </div>
      </div>
    </div>

    {picker?<GiftPicker key={picker+'-'+sourceMode} mode={picker}
      gifts={picker==='source'?sources:targets} activeId={picker==='source'?source?.id:goal?.id}
      onChoose={chooseGift} onClose={()=>setPicker(null)} sourceMode={sourceMode}
      onSourceMode={switchMode} ownedCount={owned.length}/>:null}
  </section>;
}
