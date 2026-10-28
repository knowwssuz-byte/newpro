'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowUpDown, CheckCircle2, ChevronDown, Clock3, Info,
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
const chanceText = (n) => (Number(n) || 0).toFixed(2).replace(/0+$/,'').replace(/\.$/,'');

function ChevronMark({small=false}) {
  return <span className={small ? styles.markSmall : styles.mark} aria-hidden="true"><i/><i/></span>;
}

function GiftPicker({mode,gifts,activeId,onChoose,onClose}) {
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
        <div><small>{mode==='source'?'YOUR INVENTORY':'AVAILABLE GIFTS'}</small><h2>{mode==='source'?'Beradigan sovg‘a':'Oladigan sovg‘a'}</h2></div>
        <button type="button" onClick={onClose} aria-label="Yopish"><X size={18}/></button>
      </div>
      <div className={styles.searchRow}>
        <label className={styles.searchField}><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Sovg‘a nomini yozing" aria-label="Gift qidirish"/></label>
        <button type="button" onClick={()=>setSort(s=>s==='asc'?'desc':'asc')} className={styles.sortButton} aria-label="Narx bo‘yicha tartiblash"><ArrowUpDown size={15}/><span>{sort==='asc'?'Arzon':'Qimmat'}</span></button>
      </div>
      <p className={styles.resultCount}>{list.length} ta sovg‘a</p>
      <div className={styles.pickerList}>
        {list.map(item=><button type="button" key={item.id} className={styles.pickRow} data-active={item.id===activeId} disabled={mode==='target'&&!item.available} style={mode==='target'&&!item.available?{opacity:.45,cursor:'not-allowed'}:undefined} onClick={()=>onChoose(item)}>
          <span className={styles.pickThumb}><UpgradeGiftThumb item={item} alt=""/></span>
          <span className={styles.pickText}><strong>{item.title}</strong><small>{mode==='source'?'Inventaringizdagi sovg‘a':item.available?'Gift baza · mavjud':'Zaxira yo‘q'}</small></span>
          <span className={styles.pickPrice}><StarIcon variant="gold" size={14}/>{fmt(item.price)}</span>
        </button>)}
        {!list.length ? <div className={styles.emptyResult}>{mode==='source'?'Inventarda mos sovg‘a yo‘q':'Qimmatroq sovg‘a topilmadi'}</div>:null}
      </div>
      <p className={styles.pickerFoot}>{mode==='source'?'Faqat sizga tegishli, band qilinmagan sovg‘alar ko‘rsatiladi.':'Tanlangan sovg‘a yutuqda inventarga qo‘shiladi.'}</p>
    </section>
  </div>;
}

function ItemCard({item,label,subtitle,onClick,disabled=false,side}) {
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

function UpgradeWheel({chance,rotation,rolling,reduceMotion,onRest}) {
  const arc=Math.max(0,Math.min(100,chance))*3.6;
  const style={ '--win-angle':arc+'deg', transform:'rotate('+rotation+'deg)' };
  return (
    <div className={styles.wheelFrame} data-rolling={rolling} role="img"
      aria-label={'Upgrade barabani. Yutish hududi '+chanceText(chance)+' foiz.'}>
      <div className={styles.wheelHalo} aria-hidden="true"/>
      <div className={styles.wheelRotorTexture} aria-hidden="true"
        style={{transform:'rotate('+rotation+'deg)'}} />
      <div className={styles.wheelDisc} style={style}
        onTransitionEnd={e=>{if(e.target===e.currentTarget&&e.propertyName==='transform')onRest()}}>
        <div className={styles.wheelGloss} aria-hidden="true"/>
        <div className={styles.wheelTicks} aria-hidden="true"/>
        <div className={styles.wheelBezel} aria-hidden="true"/>
      </div>
      <img className={styles.wheelAssetFrame}
        src="/feature/upgrade/art/frame-metal.webp" alt="" aria-hidden="true"
        width="512" height="512" draggable={false}/>
      <div className={styles.wheelCenter} aria-hidden="true">
        <img src="/feature/upgrade/art/hub-emblem.webp"
          className={styles.hubCrystal} alt="" width="512" height="512" draggable={false}/>
        <span className={styles.hubBrand}>NEWPRO</span>
      </div>
      <div className={styles.wheelNeedle} aria-hidden="true">
        <img src="/feature/upgrade/art/pointer-gold.webp" alt=""
          width="136" height="200" draggable={false}/>
      </div>
      {reduceMotion?<span className={styles.srOnly}>Harakat kamaytirilgan</span>:null}
    </div>
  );
}

export default function UpgradeLab({
  onBack, history=[], inventoryGifts=[], catalogGifts=[], cases=[], withdrawals=[],
  upgradeRounds=[], apiPost, onRefresh, onToast, tg,
}) {
  const owned=useMemo(()=>getInventoryRows(history,inventoryGifts,cases,withdrawals)
    .map(({item,gift})=>normalizeUpgradeGift(gift,item.id)).filter(Boolean),
    [history,inventoryGifts,cases,withdrawals]);
  const catalog=useMemo(()=>catalogGifts.filter(g=>g?.is_active!==false)
    .map(g=>{const item=normalizeUpgradeGift(g);return item?{...item,available:Number(g.stock)>0}:null;})
    .filter(Boolean).sort((a,b)=>a.price-b.price),
    [catalogGifts]);
  const [sourceId,setSourceId]=useState(null);
  const [targetId,setTargetId]=useState(null);
  const [picker,setPicker]=useState(null);
  const [confirm,setConfirm]=useState(false);
  const [phase,setPhase]=useState('idle');
  const [won,setWon]=useState(false);
  const [rotation,setRotation]=useState(0);
  const [settledChance,setSettledChance]=useState(null);
  const [resultTitle,setResultTitle]=useState('');
  const [resultGift,setResultGift]=useState(null);
  const [soundEnabled,setSoundEnabled]=useState(true);
  const [reduceMotion,setReduceMotion]=useState(false);
  const [error,setError]=useState('');
  const rotationRef=useRef(0);
  const runningRef=useRef(false);
  const planRef=useRef(null);
  const pendingRef=useRef(null);
  const fallbackTimer=useRef(null);
  const confettiRef=useRef(null);
  const fxEngine=useRef(null);

  const source=owned.find(item=>item.id===sourceId)||null;
  const targets=useMemo(()=>source?catalog.filter(item=>item.price>source.price&&item.catalogId!==source.catalogId):[],[source,catalog]);
  const goal=targets.find(item=>item.id===targetId&&item.available)||null;
  const estimatedChance=upgradeChance(source,goal);
  const chance=(phase==='rolling'||phase==='result')&&settledChance!==null?settledChance:estimatedChance;
  const multiplier=source&&goal?goal.price/source.price:0;
  const blocked=phase==='checking'||phase==='rolling';

  useEffect(()=>{
    const mq=window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(mq.matches);
    try{const saved=localStorage.getItem('myst-upgrade-sounds');if(saved!==null)setSoundEnabled(saved!=='off')}catch{}
    return ()=>{if(fallbackTimer.current)clearTimeout(fallbackTimer.current);fxEngine.current?.reset?.()};
  },[]);

  useEffect(()=>{
    if(phase!=='rolling'||reduceMotion||!soundEnabled)return;
    // Light mechanical ratchet beats (no continuous animation/audio loop).
    const marks=[190,320,445,565,685,810,940,1080,1230,1390,1570,1770,2000,2260,2540,2870,3250,3660,4100];
    const timers=marks.map(ms=>setTimeout(()=>upgradeSound('tick',true),ms));
    return ()=>timers.forEach(clearTimeout);
  },[phase,reduceMotion,soundEnabled]);

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
    const result=planRef.current;
    runningRef.current=false;
    planRef.current=null;
    pendingRef.current=null;
    setWon(result.won);setResultTitle(result.title);setResultGift(result.item || null);setPhase('result');
    setSourceId(null);setTargetId(null);
    if(result.won)celebrate();
    upgradeSound(result.won?'win':'miss',result.soundEnabled);
    tg?.HapticFeedback?.notificationOccurred?.(result.won?'success':'warning');
    onRefresh?.().catch?.(()=>{});
  },[celebrate,onRefresh,tg]);

  const performSpin=async()=>{
    if(blocked||runningRef.current||!source||!goal||estimatedChance<=0||!apiPost)return;
    upgradeSound('select',soundEnabled); // Prime iOS WebAudio in the direct tap gesture.
    setConfirm(false);setError('');setPhase('checking');
    const request=(
      pendingRef.current?.sourceId===source.id && pendingRef.current?.targetId===goal.catalogId
    )?pendingRef.current:{
      requestId:globalThis.crypto?.randomUUID?.(),sourceId:source.id,targetId:goal.catalogId,
    };
    if(!request.requestId){
      setError('Xavfsiz urinish identifikatorini yaratib bo‘lmadi. Sahifani yangilang.');
      setPhase('idle');return;
    }
    pendingRef.current=request;
    try {
      const result=await apiPost('/api/upgrade',{
        historyId:request.sourceId,targetGiftId:request.targetId,requestId:request.requestId,
        quote:{sourcePrice:source.price,targetPrice:goal.price,chance:estimatedChance},
      },{timeoutMs:20000});
      const actualChance=Number(result.chance);
      if(!Number.isFinite(actualChance)||actualChance<=0||actualChance>85)throw new Error('Serverdan yaroqsiz ehtimol qaytdi. Tarixni yangilang.');
      const landing=planUpgradeSpin({chance:actualChance,previousRotation:rotationRef.current,
        pointerDeg:POINTER_DEG,win:Boolean(result.won),randomValue:Math.random()});
      if(didWheelLandInSafeZone(actualChance,landing.endRotation,POINTER_DEG)!==Boolean(result.won))
        throw new Error('Baraban tasvirida xatolik bor. Inventar tarixini yangilang.');
      setSettledChance(actualChance);
      setWon(false);setResultTitle('');
      runningRef.current=true;
      planRef.current={...landing,won:Boolean(result.won),title:goal.title,item:goal,soundEnabled};
      rotationRef.current=landing.endRotation;
      setPhase('rolling');
      setRotation(landing.endRotation);
      upgradeSound('start',soundEnabled);
      if(fallbackTimer.current)clearTimeout(fallbackTimer.current);
      fallbackTimer.current=setTimeout(finishSpin,reduceMotion?100:SPIN_MS+300);
    }catch(e){
      if(String(e?.message||'').includes('o‘zgardi'))pendingRef.current=null;
      // The request might have settled on the server even if the response was lost.
      // Retrying uses the exact same requestId; PostgreSQL returns the original result.
      setError(e?.name==='AbortError'
        ? 'Server javobi kechikdi. Xuddi shu tanlov bilan qayta urinib, natijani tekshiring.'
        : e?.message||'Upgrade natijasini tekshirib bo‘lmadi.');
      setPhase('idle');
      onRefresh?.().catch?.(()=>{});
    }
  };

  const chooseGift=item=>{
    if(blocked||(picker==='target'&&!item.available))return;
    if(picker==='source'){setSourceId(item.id);setTargetId(null)}
    else setTargetId(item.id);
    upgradeSound('select',soundEnabled);
    pendingRef.current=null;setSettledChance(null);setResultTitle('');setResultGift(null);
    setError('');setPhase('idle');setPicker(null);
  };

  return <section className={styles.root}>
    <div className={styles.header}>
      <button type="button" disabled={blocked} onClick={onBack} className={styles.back} aria-label="Orqaga"><ArrowLeft size={19}/></button>
      <img src="/feature/upgrade/art/pointer-gold.webp" className={styles.headerCrest} alt="" aria-hidden="true" />
      <div className={styles.headerTitle}><strong>UPGRADE</strong><small>NEWPRO / LIVE</small></div>
      <span className={styles.headerMode}><ShieldCheck size={13}/> LIVE</span>
      <button type="button" onClick={changeSound} className={styles.soundButton}
        aria-label={soundEnabled?'Ovozni o‘chirish':'Ovozni yoqish'} title={soundEnabled?'Ovozni o‘chirish':'Ovozni yoqish'}>
        {soundEnabled?<Volume2 size={17}/>:<VolumeX size={17}/>}
      </button>
    </div>

    <div className={styles.stage} data-phase={phase} data-win={phase==='result'&&won}>
      <canvas ref={confettiRef} className={styles.confetti} aria-hidden="true"/>
      <div className={styles.wheelSection}>
        <div className={styles.wheelCaption}><span className={styles.microTitle}>UPGRADE WHEEL</span></div>
        <UpgradeWheel chance={chance} rotation={rotation} rolling={phase==='rolling'} reduceMotion={reduceMotion} onRest={finishSpin}/>
        <div className={styles.chanceLine} aria-live="polite">
          <span>WIN CHANCE</span>
          <strong>{chanceText(chance)}%</strong>
          <span>{source&&goal?multiplier.toFixed(2)+'× MULTIPLIER':'SOVG‘A TANLANG'}</span>
        </div>
        <div className={styles.chanceDetails}>
          <span><i/> YUTISH ZONASI <b>{chanceText(chance)}%</b></span>
          <span><i/> QOLGAN ZONA <b>{chanceText(100-chance)}%</b></span>
        </div>
      </div>

      <div className={styles.cards}>
        <ItemCard side="source" label="Beradigan sovg‘a" subtitle="Inventaringizdan" item={source}
          disabled={blocked||!owned.length} onClick={()=>setPicker('source')}/>
        <ItemCard side="target" label="Oladigan sovg‘a" subtitle="Yutishingiz mumkin" item={goal}
          disabled={blocked||!targets.length} onClick={()=>setPicker('target')}/>
      </div>

      <div className={styles.controls}>
        <button type="button" className={styles.improve} disabled={!source||!goal||blocked||estimatedChance<=0}
          onClick={()=>{setConfirm(true);setError('')}}>
          {blocked?<RotateCcw size={19} className={styles.spinIcon}/>:<ChevronMark small/>}
          <strong>{blocked?'UPGRADING…':'IMPROVE'}</strong>
        </button>
        {error?<p role="alert" className={styles.error}>{error}</p>:null}
        {phase==='result'?<div className={styles.winnerLine} data-result={won?'won':'lost'}>
          {won&&resultGift?<UpgradeGiftThumb item={resultGift} alt={resultGift.title}/>:won?<CheckCircle2 size={22}/>:<Info size={22}/>}
          <div><strong>{won?'UPGRADE SUCCESS':'UPGRADE FINISHED'}</strong>
            <span>{won?resultTitle+' — inventarga qo‘shildi':'Tanlangan sovg‘a sarflandi'}</span></div>
        </div>:null}
        {!owned.length&&phase!=='result'?<p className={styles.emptyHint}>Upgrade boshlash uchun inventaringizda sovg‘a bo‘lishi kerak.</p>:null}
        <div className={styles.footnote}><Info size={14}/>
          <span>{multiplier?multiplier.toFixed(2)+'× · ':''}Yutqazsangiz, berilgan sovg‘a qaytarilmaydi.</span>
        </div>
      </div>
    </div>

    {upgradeRounds.length?<div className={styles.historyPanel}>
      <div className={styles.historyHead}><Clock3 size={16}/><strong>So‘nggi urinishlar</strong></div>
      {upgradeRounds.slice(0,6).map(round=><div className={styles.historyRow} key={round.id}>
        <span><b>{round.outcome==='won'?'YUTUQ':'YUTQAZDI'}</b><small>{new Date(round.created_at).toLocaleString('uz-UZ')}</small></span>
        <span>{chanceText(round.chance)}% <strong>{fmt(round.source_price)} → {fmt(round.target_price)} ★</strong></span>
      </div>)}
    </div>:null}

    {picker?<GiftPicker mode={picker} gifts={picker==='source'?owned:targets}
      activeId={picker==='source'?sourceId:targetId}
      onChoose={chooseGift} onClose={()=>setPicker(null)}/>:null}
    {confirm?<div className={styles.backdrop} onMouseDown={e=>{if(e.target===e.currentTarget)setConfirm(false)}}>
      <section className={styles.confirmSheet} role="alertdialog" aria-modal="true" aria-label="Upgrade tasdiqlash">
        <ShieldCheck size={27}/>
        <h2>Upgrade’ni tasdiqlaysizmi?</h2>
        <p><strong>{source?.title}</strong> ({fmt(source?.price)} ★) sarflanadi. Yutish ehtimoli <strong>{chanceText(estimatedChance)}%</strong>. Yutqazsangiz, sovg‘a qaytarilmaydi.</p>
        <div className={styles.confirmActions}>
          <button type="button" onClick={()=>setConfirm(false)}>Bekor qilish</button>
          <button type="button" onClick={performSpin}>Tasdiqlash va boshlash</button>
        </div>
      </section>
    </div>:null}
  </section>;
}
