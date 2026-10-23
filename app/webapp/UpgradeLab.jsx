'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Check, ChevronDown,
  CircleCheck, CircleX, Crown, Gem, Info, LockKeyhole, RotateCcw,
  Search, ShieldCheck, SlidersHorizontal, Sparkles, Trophy, X, Zap,
} from 'lucide-react';
import { getInventoryRows } from '@/lib/inventory.mjs';
import { normalizeUpgradeGift, upgradeChance, wheelSegments, spinIndex, landedInSafeZone } from '@/lib/upgradeLab.mjs';
import { upgradeSound } from './upgradeAudio';
import { UpgradeGiftThumb } from './UpgradeGiftThumb';
import StarIcon from './StarIcon';
import styles from './UpgradeLab.module.css';

const format = value => new Intl.NumberFormat('uz-UZ',{ maximumFractionDigits: 0 }).format(Number(value)||0);
const AMBIENT = ['#1C2951','#303364','#182D58','#323163','#192649','#343369','#24365E','#352F61','#1C365B','#2B315E','#1E2C56'];

function GiftPicker({ mode, gifts, activeId, onChoose, onClose, sourceMode, onSourceMode, ownedCount }) {
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('asc');
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase();
    return gifts.filter(item => !q || item.title.toLocaleLowerCase().includes(q))
      .sort((a,b)=> sort === 'desc' ? b.price-a.price : a.price-b.price);
  }, [gifts,query,sort]);
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown',onKey);
    return () => document.removeEventListener('keydown',onKey);
  },[onClose]);
  return (
    <div className={styles.sheetBackdrop} onMouseDown={event => { if(event.target===event.currentTarget)onClose(); }}>
      <section className={styles.sheet} role="dialog" aria-modal="true" aria-label={mode==='source'?'Gift tanlash':'Target gift tanlash'}>
        <div className={styles.sheetHandle} aria-hidden="true"/>
        <div className={styles.sheetHead}>
          <div><small>{mode==='source'?'STEP 01 / MY GIFT':'STEP 02 / TARGET GIFT'}</small><h2>{mode==='source'?'Giftni tanlash':'Yangilanadigan gift'}</h2></div>
          <button type="button" onClick={onClose} aria-label="Yopish"><X size={20}/></button>
        </div>
        {mode==='source' ? <div className={styles.sourceTabs}>
          <button type="button" className={sourceMode==='mine'?styles.tabSelected:''} onClick={()=>onSourceMode('mine')} disabled={!ownedCount}>Inventarim ({ownedCount})</button>
          <button type="button" className={sourceMode==='catalog'?styles.tabSelected:''} onClick={()=>onSourceMode('catalog')}>Demo katalog</button>
        </div> : null}
        <div className={styles.searchRow}>
          <label className={styles.search}><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Gift nomini qidiring..." aria-label="Gift qidirish"/></label>
          <button type="button" className={styles.sort} onClick={()=>setSort(current=>current==='asc'?'desc':'asc')} aria-label="Narx bo‘yicha tartiblash"><SlidersHorizontal size={16}/><span>{sort==='asc'?'Arzon':'Qimmat'}</span></button>
        </div>
        <p className={styles.searchInfo}>{list.length} ta gift · rasmlar Telegram gift kutubxonasidan</p>
        <div className={styles.pickerList}>
          {list.length ? list.map(item=>(
            <button type="button" className={[styles.giftPick,item.id===activeId?styles.pickActive:''].join(' ')} key={item.id} onClick={()=>onChoose(item)}>
              <span className={styles.pickerArt}><UpgradeGiftThumb item={item} alt=""/></span>
              <span className={styles.pickerDetails}><strong>{item.title}</strong><small>{item.owned?'Mening giftim':'Katalog · demo'}</small><span className={styles.giftCost}><StarIcon variant="gold" size={15}/>{format(item.price)}</span></span>
              <span className={styles.pickCheck}>{item.id===activeId?<CircleCheck size={19}/>:<ArrowRight size={16}/>}</span>
            </button>
          )):<div className={styles.pickerEmpty}><Gem size={30}/><strong>Gift topilmadi</strong><p>Boshqa nom yoki arzonroq giftni tanlang.</p></div>}
        </div>
        <div className={styles.sheetFoot}>Tanlov faqat demo animatsiyasiga ta’sir qiladi. Balansingiz saqlanadi.</div>
      </section>
    </div>
  );
}

export default function UpgradeLab({ onBack, history=[], inventoryGifts=[], catalogGifts=[], cases=[], withdrawals=[] }) {
  const owned = useMemo(() => getInventoryRows(history,inventoryGifts,cases,withdrawals)
    .map(({item,gift})=>normalizeUpgradeGift(gift,item.id)).filter(Boolean),[history,inventoryGifts,cases,withdrawals]);
  const catalog = useMemo(() => catalogGifts
    .filter(g=>g?.is_active!==false && Number(g?.stock)>0)
    .map(g=>normalizeUpgradeGift(g)).filter(Boolean).sort((a,b)=>a.price-b.price),[catalogGifts]);

  const [sourceMode,setSourceMode] = useState(owned.length?'mine':'catalog');
  const [sourceId,setSourceId] = useState(null);
  const [targetId,setTargetId] = useState(null);
  const [picker,setPicker] = useState(null);
  const [phase,setPhase] = useState('idle');
  const [wasSuccessful,setWasSuccessful] = useState(false);
  const [ready,setReady] = useState(false);
  const [error,setError] = useState('');
  const [plays,setPlays] = useState(0);
  const [wins,setWins] = useState(0);
  const wheelContainer = useRef(null);
  const wheel = useRef(null);
  const outcome = useRef(null);
  const timer = useRef(null);
  const spinLock = useRef(false);
  const shouldReduceMotion = useRef(false);
  const confettiCanvas = useRef(null);
  const confettiEngine = useRef(null);
  const fxTimeout = useRef(null);
  const lastClick = useRef(0);
  const soundEnabledRef = useRef(true);
  const [soundEnabled,setSoundEnabled] = useState(true);

  useEffect(()=>{
    try {
      const stored=window.localStorage.getItem('myst-upgrade-sounds');
      if(stored!==null){setSoundEnabled(stored!=='off');soundEnabledRef.current=stored!=='off'}
    }catch{}
  },[]);
  const toggleSound=()=>{
    setSoundEnabled(current=>{
      const next=!current;
      soundEnabledRef.current=next;
      try{window.localStorage.setItem('myst-upgrade-sounds',next?'on':'off')}catch{}
      return next;
    });
  };
  const celebrate=useCallback(async()=>{
    if(shouldReduceMotion.current || !confettiCanvas.current)return;
    try{
      if(!confettiEngine.current){
        const vendor=await import('./vendor/confetti-esm.js');
        if(!confettiCanvas.current)return;
        confettiEngine.current=vendor.default.create(confettiCanvas.current,{resize:true,useWorker:false});
      }
      const fire=confettiEngine.current;
      fire({particleCount:105,spread:93,startVelocity:34,gravity:.84,scalar:.9,origin:{x:.47,y:.55},colors:['#FFE4A1','#E1B2FF','#B5FFF0','#E5CDFF','#FFFFFF']});
      if(fxTimeout.current)clearTimeout(fxTimeout.current);
      fxTimeout.current=window.setTimeout(()=>{
        fire({particleCount:68,spread:135,startVelocity:27,gravity:.70,scalar:1.1,origin:{x:.54,y:.41},colors:['#FFD473','#91FFE1','#E1ADFF','#F6F0FF']});
      },210);
    }catch{ /* Effects never prevent reporting an Upgrade result. */ }
  },[]);
  useEffect(()=>()=>{if(fxTimeout.current)clearTimeout(fxTimeout.current);confettiEngine.current?.reset?.()},[]);


  const sources = sourceMode==='mine' && owned.length ? owned : catalog;
  const source = sources.find(x=>x.id===sourceId) || sources[0] || null;
  const targets = useMemo(() => source ? catalog.filter(item=>item.price>source.price && item.catalogId!==source.catalogId):[],[source,catalog]);
  const goal = targets.find(x=>x.id===targetId) || targets[0] || null;
  const chance = upgradeChance(source,goal);
  const ratio = goal && source ? Math.round(goal.price/source.price*10)/10:0;

  const finishSpin = useCallback((landedIndex) => {
    const state = outcome.current;
    if (!state || state.done) return;
    state.done = true;
    if(timer.current){window.clearTimeout(timer.current);timer.current=null}
    const index=Number.isInteger(landedIndex) ? landedIndex : wheel.current?.getCurrentIndex();
    // Only the pointer's ACTUAL landing zone decides the final result.
    const won=landedInSafeZone(chance,index);
    spinLock.current=false;
    setWasSuccessful(won);
    setPlays(n=>n+1);
    if(won) {setWins(n=>n+1);celebrate()}
    upgradeSound(won?'win':'miss',soundEnabledRef.current);
    setPhase('result');
  },[chance,celebrate]);

  useEffect(()=>{
    shouldReduceMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  },[]);

  useEffect(() => {
    let cancelled=false;
    setReady(false);
    setError('');
    spinLock.current=false;
    outcome.current=null;
    if (timer.current) { window.clearTimeout(timer.current); timer.current=null; }
    if (wheel.current) { try{wheel.current.remove()}catch{} wheel.current=null; }
    if (!source || !goal || !wheelContainer.current) return;
    const host=wheelContainer.current;
    host.replaceChildren();

    (async()=>{
      try{
        // Existing MIT Spin Wheel renders the actual percentage-sized SAFE ZONE.
        // Do not place gift photos inside the wheel: collectible previews belong on either side.
        const vendor = await import('./vendor/spin-wheel-esm.js');
        if(cancelled || !host.isConnected) return;
        const items = wheelSegments(chance).map((entry,i)=>({
          label: entry.result==='win' ? 'SAFE ZONE' : '',
          value: entry.result,
          weight: entry.weight,
          backgroundColor: entry.result==='win' ? '#11AC84' : AMBIENT[i % AMBIENT.length],
          labelColor: entry.result==='win' ? '#FFF5D3' : '#BFB8DA',
        }));
        const instance = new vendor.Wheel(host,{
          items,
          isInteractive:false,
          // CrazyTim angles: 90 degrees is 12 o'clock (top).
          pointerAngle:90,
          radius:.91,
          itemLabelFont:'Inter, system-ui, sans-serif',
          itemLabelFontSizeMax:12,
          itemLabelRadius:.86,
          itemLabelRadiusMax:.22,
          itemLabelAlign:'center',
          itemLabelColors:['#f7f4ff'],
          borderColor:'rgba(210,185,255,.32)',
          borderWidth:3,
          lineColor:'rgba(232,222,255,.28)',
          lineWidth:2,
          onCurrentIndexChange:()=>{
            const now=performance.now();
            if(spinLock.current && now-lastClick.current>85){
              lastClick.current=now;
              upgradeSound('tick',soundEnabledRef.current);
            }
          },
          onRest:(event)=>{if(!cancelled)finishSpin(event?.currentIndex)},
        });
        if(cancelled){instance.remove();return}
        wheel.current=instance;
        setReady(true);
      }catch(err){
        if(!cancelled){setError('Baraban tasvirlari yuklanmadi. Sahifani yangilang.');setReady(false)}
      }
    })();
    return ()=>{cancelled=true;if(wheel.current){try{wheel.current.remove()}catch{}wheel.current=null}
      if(timer.current){window.clearTimeout(timer.current);timer.current=null}};
  },[source?.id,goal?.id,chance,finishSpin]);

  const selectGift = (item) => {
    if (spinLock.current) return;
    if(picker==='source'){setSourceId(item.id);setTargetId(null)}
    else setTargetId(item.id);
    setPhase('idle');
    setPicker(null);
  };
  const openPicker=(section)=>{if(phase!=='rolling')setPicker(section)};
  const play=()=>{
    if(spinLock.current||!ready||!source||!goal||chance<=0||!wheel.current)return;
    const hit=Math.random()*100<chance;
    const selectedIndex=spinIndex(hit,Math.random());
    outcome.current={done:false};
    setPhase('rolling');
    setWasSuccessful(false);
    spinLock.current=true;
    upgradeSound('start',soundEnabledRef.current);
    try {
      if(shouldReduceMotion.current){
        wheel.current.spinToItem(selectedIndex,0,true,0,1);
        finishSpin(selectedIndex);
      }else{
        wheel.current.spinToItem(selectedIndex,4600,true,7,1,t=>1-Math.pow(1-t,4));
        timer.current=window.setTimeout(()=>{
          const currentIndex=wheel.current?.getCurrentIndex();
          try{wheel.current?.stop()}catch{}
          finishSpin(currentIndex);
        },5600);
      }
    }catch{
      spinLock.current=false;
      outcome.current=null;
      setPhase('idle');
      setError('Baraban ishga tushmadi. Sahifani yangilang.');
    }
  };
  const again=()=>{if(spinLock.current)return;setPhase('idle');setWasSuccessful(false)};

  const pickerGifts=picker==='source'?sources:targets;
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <button className={styles.back} type="button" onClick={onBack} aria-label="Orqaga qaytish"><ArrowLeft size={20}/></button>
        <div><small>MYST / EXPERIENCE</small><h1>Gift Upgrade</h1></div>
        <span className={styles.demoLabel}><ShieldCheck size={13}/> DEMO</span>
      </header>

      <div className={styles.premiumHero}>
        <div className={styles.heroTitle}><span><Sparkles size={15}/> NEWPRO UPGRADE STUDIO</span><h2>Premium gift <em>upgrade</em></h2><p>Beradigan sovg‘ani tanlang, markazdagi barabanni aylantiring va natijani kuzating.</p></div>
        <div className={styles.heroIcons} aria-hidden="true"><img src="/feature/upgrade/royal-star.svg" alt=""/><img src="/feature/upgrade/royal-boost.svg" alt=""/><img src="/feature/upgrade/royal-gem.svg" alt=""/></div>
      </div>
      <div className={styles.stepHeader}><span>01 <b>UPGRADE BARABANI</b></span><small>SOVG‘A → BARABAN → SOVG‘A</small></div>
      <div className={styles.upgradeArena}>
        <div className={styles.arenaDecor} aria-hidden="true"><img src="/feature/upgrade/royal-gift.svg" alt=""/><img src="/feature/upgrade/royal-crown.svg" alt=""/><img src="/feature/upgrade/royal-boost.svg" alt=""/></div>
        <div className={`${styles.giftColumn} ${styles.giveColumn}`}>
          <span className={styles.columnLabel}>01 / BERASIZ</span>
          <button type="button" className={styles.giftSlot} onClick={()=>openPicker('source')} disabled={phase==='rolling'}>
          <span className={styles.slotTop}><span>BERADIGAN SOVG‘A</span><ChevronDown size={15}/></span>
          <span className={styles.largeArt}>{source?<UpgradeGiftThumb item={source} priority/>:<Gem size={34}/>}</span>
          <strong>{source?.title || 'Gift mavjud emas'}</strong>
          <span className={styles.slotPrice}><StarIcon variant="gold" size={17}/>{format(source?.price||0)}</span>
          <small>{source?.owned?'Inventardan':'Demo katalogdan'} · Almashtirish</small>
        </button>
        </div>
        <div className={styles.wheelColumn}>
          <div className={styles.wheelPanel} data-phase={phase} data-win={phase==='result' && wasSuccessful ? 'true' : 'false'}>
        <canvas ref={confettiCanvas} className={styles.confettiCanvas} aria-hidden="true" />
        <div className={styles.wheelIntro}>
          <div className={styles.wheelTopline}>
            <span><Zap size={14}/> PRECISION SPIN ENGINE</span>
            <button type="button" className={styles.soundToggle} onClick={toggleSound}
              aria-pressed={soundEnabled} aria-label={soundEnabled?'Baraban ovozini o‘chirish':'Baraban ovozini yoqish'}>
              {soundEnabled ? '◖)) Ovoz yoqilgan' : '◖× Ovoz o‘chiq'}
            </button>
          </div>
          <strong>Upgrade Wheel</strong>
          <p>Faqat oltin-yashil SAFE ZONE ustida to‘xtasangiz, demo g‘alaba hisoblanadi.</p>
        </div>
        <div className={styles.safeInfo} aria-label={`G‘alaba xavfsiz zonasi ${chance.toFixed(1)} foiz`}>
          <div className={styles.safeInfoTitle}>
            <span className={styles.safePill}><img src="/feature/upgrade/win-spark.svg" alt=""/> SAFE ZONE</span>
            <strong>{chance.toFixed(1)}%</strong>
          </div>
          <div className={styles.safeProgress}><span style={{width:`${chance}%`}}/></div>
          <small><span>{(chance*3.6).toFixed(1)}° g‘alaba sektori</span><span>{(100-chance).toFixed(1)}% TRY AGAIN</span></small>
        </div>
        <div className={styles.wheelStage}>
          <img className={styles.metalPointer} src="/feature/upgrade/pointer-gold.svg" alt="" aria-hidden="true" draggable={false}/>
          <div className={styles.outerRing}>
            <div className={styles.wheelMount} ref={wheelContainer} role="img" aria-label={`Upgrade barabani, demo imkoniyat ${chance.toFixed(1)} foiz`}/>
            {!ready?<div className={styles.waitingWheel} role="status"><Sparkles size={28}/><span>{error?'Ulanish xatosi':'Gift rasmlari tayyorlanmoqda…'}</span></div>:null}
            <div className={styles.hub} aria-hidden="true"><img src="/feature/upgrade/wheel-medallion.svg" alt="" draggable={false}/></div>
          </div>
        </div>
        <div className={styles.spinStatus} role="status">
          {phase==='rolling'?<><span className={styles.liveDot}/> Baraban aylanyapti · ko‘rsatkich zonani aniqlaydi…</>
          :phase==='result'?(wasSuccessful?<><CircleCheck size={18}/> DEMO UPGRADE MUVAFFAQIYATLI</>:<><CircleX size={18}/> DEMO: QAYTA URINISH</>)
          :<><LockKeyhole size={16}/> Stars va haqiqiy giftlar sarflanmaydi</>}
        </div>
        {phase==='result' ? (
          <div className={styles.result} data-success={wasSuccessful?'true':'false'}>
            <div className={styles.resultThumb}><UpgradeGiftThumb item={wasSuccessful?goal:source}/></div>
            <div><small>{wasSuccessful?'DEMO UPGRADE':'DEMO RESULT'}</small><strong>{wasSuccessful?goal?.title:'Qayta urinib ko‘ring'}</strong>
              <p>{wasSuccessful?'Simulyatsiya natijasi — real inventarga gift qo‘shilmadi.':'Asl sovg‘angiz va balansingiz o‘zgarishsiz qoldi.'}</p>
            </div>
          </div>
        ):null}
        {phase==='result' ?
          <button type="button" className={styles.mainButton} onClick={again}><RotateCcw size={17}/> Yangi aylanish</button>
          :<button type="button" className={styles.mainButton} disabled={!ready||phase==='rolling'||!source||!goal||chance<=0} onClick={play}>
            <Zap size={19}/>{phase==='rolling'?'BARABAN AYLANMOQDA…':'UPGRADE DEMO'}<ArrowUpRight size={17}/>
          </button>
        }
        {error?<p className={styles.error} role="alert">{error}</p>:null}
        <p className={styles.disclaimer}><Info size={14}/> Faqat demo: hech qanday sovg‘a yoki Stars sarflanmaydi, natijalar inventarga o‘tmaydi.</p>
      </div>
        </div>
        <div className={`${styles.giftColumn} ${styles.receiveColumn}`}>
          <span className={styles.columnLabel}>02 / OLASIZ</span>
          <button type="button" className={styles.giftSlot} onClick={()=>openPicker('target')} disabled={phase==='rolling'||!targets.length}>
          <span className={styles.slotTop}><span>OLADIGAN SOVG‘A</span><ChevronDown size={15}/></span>
          <span className={styles.largeArt}>{goal?<UpgradeGiftThumb item={goal} priority/>:<Gem size={34}/>}</span>
          <strong>{goal?.title || 'Target topilmadi'}</strong>
          <span className={styles.slotPrice}><StarIcon variant="gold" size={17}/>{format(goal?.price||0)}</span>
          <small>{goal?'Yuqoriroq qiymatli gift':'Boshqa giftni tanlang'}</small>
        </button>
        </div>
      </div>
      <div className={styles.banner}>
        <div className={styles.bannerMesh} aria-hidden="true"/>
        <div className={styles.bannerCopy}><span><Sparkles size={13}/> UPGRADE STUDIO</span><h2>Giftlaringizga <em>yangi daraja.</em></h2>
        <p>Haqiqiy gift rasmlari, baraban va silliq animatsiya — barchasi demo rejimida.</p></div>
        <div className={styles.bannerGem} aria-hidden="true"><Gem size={66} strokeWidth={1.2}/><span/></div>
      </div>

      <div className={styles.metrics}>
        <div><small>Demo imkoniyat</small><strong>{chance.toFixed(1)}%</strong></div>
        <div><small>Qiymat farqi</small><strong>{ratio?ratio.toFixed(1)+'×':'—'}</strong></div>
        <div><small>Demo g‘alabalar</small><strong>{wins} <span>/ {plays}</span></strong></div>
      </div>


      {picker ? <GiftPicker key={picker+'-'+sourceMode} mode={picker} gifts={pickerGifts} activeId={picker==='source'?source?.id:goal?.id} sourceMode={sourceMode}
        ownedCount={owned.length} onSourceMode={mode=>{setSourceMode(mode);setSourceId(null);setTargetId(null);setPhase('idle')}} onChoose={selectGift} onClose={()=>setPicker(null)}/> : null}
    </section>
  );
}
