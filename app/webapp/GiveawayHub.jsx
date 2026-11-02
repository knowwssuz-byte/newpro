'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,ChevronDown,Clock3,Crown,Gift,LoaderCircle,RefreshCcw,ShieldCheck,Sparkles,Star,Ticket,Users,Wallet,X,Trophy} from 'lucide-react';
import styles from './GiveawayHub.module.css';

const fmt=n=>new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(Number(n||0));
const chanceText=n=>(Number(n||0)<.01&&Number(n||0)>0?'<0.01':Number(n||0).toFixed(2))+'%';
const whenLeft=(v,now)=>{
 const ms=Math.max(0,new Date(v).getTime()-now);
 const d=Math.floor(ms/86400000),h=Math.floor(ms%86400000/3600000),m=Math.floor(ms%3600000/60000),s=Math.floor(ms%60000/1000);
 return d>0?d+' kun '+h+' soat':h>0?h+' soat '+m+' daqiqa':m>0?m+' daqiqa '+s+' soniya':s+' soniya';
};
const requestUuid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():null;

function PrizeArt({prize,className=''}) {
 const [failed,setFailed]=useState(false);
 useEffect(()=>setFailed(false),[prize?.imageUrl]);
 return <span className={styles.prizeArt+' '+className}>
  {prize?.imageUrl&&!failed?<img src={prize.imageUrl} alt={prize.title||'Telegram Gift'}
    loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<Gift size={44} strokeWidth={1.35}/>}
 </span>;
}

function OddsBoard({item,apiPost,featured}) {
 const [open,setOpen]=useState(Boolean(featured));
 const [rows,setRows]=useState([]);
 const [total,setTotal]=useState(0);
 const [more,setMore]=useState(null);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState('');
 const [revision,setRevision]=useState(0);
 const request=useCallback(async(offset,append,signalRef)=>{
  setLoading(true);setError('');
  try{
   const result=await apiPost('/api/giveaway',{action:'leaderboard',giveawayId:item.id,offset},{timeoutMs:15000});
   if(signalRef?.cancelled)return;
   setRows(old=>append?[...old,...(result.rows||[])]:result.rows||[]);
   setTotal(Number(result.total||0));
   setMore(result.nextOffset??null);
  }catch(e){if(!signalRef?.cancelled)setError(e.message||'Foizlar yuklanmadi.');}
  finally{if(!signalRef?.cancelled)setLoading(false);}
 },[apiPost,item.id]);
 useEffect(()=>{
  if(!open)return;
  const guard={cancelled:false};
  void request(0,false,guard);
  return()=>{guard.cancelled=true;};
 },[open,request,item.totalWeight,item.participants,revision]);
 if(item.mode!=='weighted')return null;
 return <section className={styles.odds}>
  <button type="button" className={styles.oddsHeading} onClick={()=>setOpen(v=>!v)}
    aria-expanded={open}>
   <span className={styles.oddsIcon}><Trophy size={17}/></span>
   <span className={styles.oddsTitle}><strong>Yutish ehtimollari</strong><small>1-o‘rin uchun joriy ulush · {fmt(item.participants)} ishtirokchi</small></span>
   <ChevronDown className={open?styles.chevronOpen:styles.chevron} size={17}/>
  </button>
  {open?<div className={styles.oddsBody}>
   {rows.length>0?<div className={styles.oddsRows}>
    {rows.map((person,i)=><div className={styles.oddsRow} key={(person.username||person.name)+'-'+i}
      data-me={person.isMe?'true':undefined}>
     <span className={styles.oddsRank}>{i+1}</span>
     <span className={styles.oddsPerson}><strong>{person.isMe?'Siz · ':''}{person.name}</strong>
       <small>{fmt(person.weight)} vazn · {fmt(person.stars)} ★</small></span>
     <span className={styles.oddsPercent}>{chanceText(person.chance)}</span>
     <span className={styles.oddsBar} style={{'--chance':String(Math.max(0,Math.min(100,Number(person.chance||0))))+'%'}}><i/></span>
    </div>)}
   </div>:!loading&&!error?<p className={styles.oddsEmpty}>Hozircha qatnashchilar yo‘q. Birinchi bo‘ling!</p>:null}
   {error?<div className={styles.oddsError}>{error}<button type="button" onClick={()=>setRevision(v=>v+1)}>Qayta urinish</button></div>:null}
   {loading?<div className={styles.oddsLoading}><LoaderCircle size={15} className={styles.spinner}/> Yuklanmoqda…</div>:null}
   {more!==null&&!loading?<button type="button" className={styles.loadMore}
     onClick={()=>void request(more,true)}>Yana qatnashchilarni ko‘rish ({fmt(Math.max(0,total-rows.length))}) <ArrowRight size={14}/></button>:null}
   {rows.length>0?<small className={styles.oddsFine}>Foizlar hozirgi vaznlar bo‘yicha hisoblangan. Yangi tikishlar natijani o‘zgartiradi; bir necha sovrin uchun umumiy yutish ehtimoli emas.</small>:null}
  </div>:null}
 </section>;
}

function EventCard({item,featured=false,now,joining,requestJoin,apiPost}) {
 const weighted=item.mode==='weighted';
 const [stars,setStars]=useState(String(item.price||0));
 useEffect(()=>setStars(String(item.price||0)),[item.id,item.price]);
 const completed=item.status==='completed';
 const ended=new Date(item.endsAt).getTime()<=now;
 const live=item.status==='live'&&!ended;
 const participants=Number(item.participants||0);
 const meWeight=Number(item.myWeight||0);
 const totalWeight=Number(item.totalWeight||0);
 const chance=totalWeight>0?100*meWeight/totalWeight:0;
 const participating=meWeight>0;
 const stake=Number(stars);
 const valid=Number.isSafeInteger(stake)&&stake>=Number(item.price||0)&&stake<=10000&&
  (weighted?stake>0:stake===Number(item.price||0));
 const mainPrize=(item.prizes||[])[0];
 return <article className={featured?styles.featuredEvent:styles.event} data-featured={featured?'true':undefined}>
  <div className={styles.eventTop}>
   <span className={styles.eventTag}><span className={styles.liveDot}/>{completed?'NATIJALAR':featured?'ASOSIY GIVEAWAY':'GIVEAWAY'}</span>
   <span className={styles.eventMode}><Star size={13} fill={weighted?'currentColor':'none'}/>
    {weighted?'Stars vaznli':'Teng imkoniyat'}</span>
  </div>
  <div className={styles.eventStage}>
   <div className={styles.stageCopy}>
    <span className={styles.stageOverline}>{completed?'YAKUNLANGAN':ended?'YAKUNLANMOQDA':'SOVRINLI TANLOV'}</span>
    <h3>{item.title}</h3>
    {item.description?<p>{item.description}</p>:null}
    <div className={styles.stageFacts}>
     <span><Users size={14}/>{fmt(participants)} qatnashchi</span>
     <span><Gift size={14}/>{fmt(item.prizes?.length||0)} sovrin</span>
    </div>
   </div>
   {mainPrize?<div className={styles.heroArtwork}>
    <span className={styles.artHalo}/>
    <PrizeArt prize={mainPrize} className={styles.heroPrize}/>
    <span className={styles.artCaption}><Crown size={13}/> 1-O‘RIN</span>
   </div>:null}
  </div>
  <div className={styles.infoRail}>
   <div><small>QOLGAN VAQT</small><strong><Clock3 size={15}/>{completed?'Yakunlangan':ended?'Muddat tugadi':whenLeft(item.endsAt,now)}</strong></div>
   <div><small>KIRISH NARXI</small><strong className={styles.price}>{Number(item.price)>0?fmt(item.price)+' ★':'Bepul'}</strong></div>
  </div>
  <div className={styles.prizeSection}>
   <div className={styles.prizeHeading}><strong><Sparkles size={16}/> Sovrinlar</strong><span>{item.prizes?.length||0} ta o‘rin</span></div>
   <div className={styles.prizeRail}>
    {(item.prizes||[]).map((prize,i)=><div className={styles.prizeCard} key={prize.id} style={{'--prize-index':i}}>
     <span className={styles.prizeBadge}><Crown size={12}/>{prize.place}-o‘rin</span>
     <PrizeArt prize={prize} className={styles.prizePhoto}/>
     <strong>{prize.title}</strong>
     {completed?<small>{prize.winner?'G‘olib: '+prize.winner:'G‘olib aniqlanmagan'}{prize.myWin?' · Siz yutdingiz!':''}</small>:<small>Telegram Gift</small>}
    </div>)}
   </div>
  </div>
  {weighted?<div className={styles.chanceStrip}>
   <div className={styles.chanceTop}><span><Sparkles size={16}/> Sizning 1-o‘rin ehtimolingiz</span>
    <strong>{chanceText(chance)}</strong></div>
   <div className={styles.chanceTrack}><span style={{width:String(Math.max(0,Math.min(100,chance)))+'%'}}/></div>
   <small>Sizning vazningiz: {fmt(meWeight)} · Barcha vazn: {fmt(totalWeight)}</small>
  </div>:null}
  {participating?<div className={styles.joined}><CheckCircle2 size={15}/> Siz tanlovda qatnashyapsiz
   {weighted?' · '+fmt(item.myStars)+' ★ tikilgan':''}</div>:null}
  {live?<div className={styles.joinBox}>
   {weighted?<div className={styles.stakeRow}>
     <label htmlFor={'giveaway-stake-'+item.id}>Stars miqdori</label>
     <span className={styles.stakeInput}><Star size={16} fill="currentColor"/>
       <input id={'giveaway-stake-'+item.id} type="number" min={item.price} max={10000}
       step="1" inputMode="numeric" value={stars} onChange={e=>setStars(e.target.value)}/>
       <strong>★</strong></span>
    </div>:null}
   <button className={styles.joinButton} type="button"
      disabled={joining||!valid||(!weighted&&participating)}
      onClick={()=>requestJoin(item,stake)}>
    {joining?<LoaderCircle className={styles.spinner} size={18}/>:<Ticket size={18}/>}
    {weighted?(participating?'Yana Stars qo‘shish':'Stars bilan qatnashish'):(participating?'Qatnashyapsiz':'Qatnashish')}
    <ArrowRight size={18}/></button>
  </div>:null}
  {completed&&item.prizes?.some(p=>p.myWin&&p.deliveryStatus==='pending')?
   <div className={styles.joined}><Gift size={16}/> Yutdingiz! Sovg‘a yetkazilishi kutilmoqda.</div>:null}
  {weighted?<OddsBoard item={item} featured={featured} apiPost={apiPost}/>:null}
  {completed&&item.seedReveal?<details className={styles.fairness}>
   <summary><ShieldCheck size={15}/> Tanlov tekshiruvi</summary>
   <small>Seed: {item.seedReveal}</small><small>Hash: {item.seedCommit}</small>
  </details>:null}
 </article>;
}

export default function GiveawayHub({apiPost,onBack,onBalanceChange,onToast}){
 const [data,setData]=useState({giveaways:[]});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [tab,setTab]=useState('live');
 const [joining,setJoining]=useState('');
 const [pending,setPending]=useState(null);
 const [now,setNow]=useState(Date.now());
 const retry=useRef(null);
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
   const result=await apiPost('/api/giveaway',{action:'list'},{timeoutMs:15000});
   setData(result);setError('');
   if(Number.isFinite(Number(result.balance)))onBalanceChange?.(Number(result.balance));
  }catch(e){if(!silent)setError(e.message||'Server bilan aloqa uzildi');}
  finally{if(!silent)setLoading(false);}
 },[apiPost,onBalanceChange]);
 useEffect(()=>{void refresh();const timer=window.setInterval(()=>setNow(Date.now()),1000);
  const refreshTimer=window.setInterval(()=>{if(document.visibilityState==='visible')void refresh(true);},20000);
  return()=>{window.clearInterval(timer);window.clearInterval(refreshTimer);};
 },[refresh]);
 const all=Array.isArray(data.giveaways)?data.giveaways:[];
 const active=useMemo(()=>all.filter(g=>g.status==='live').sort((a,b)=>
  Number(Boolean(b.isFeatured))-Number(Boolean(a.isFeatured))||Date.parse(b.createdAt)-Date.parse(a.createdAt)),[data.giveaways]);
 const results=useMemo(()=>all.filter(g=>g.status==='completed'),[data.giveaways]);
 const main=active[0]||null;
 const others=active.slice(1);
 const performJoin=async(item,stars)=>{
  if(joining)return;
  setPending(null);
  const previous=retry.current;
  const requestId=previous?.id===item.id&&previous?.stars===stars?previous.requestId:requestUuid();
  if(!requestId){setError('Qurilmangiz xavfsiz so‘rov ID yaratolmaydi.');return;}
  retry.current={id:item.id,stars,requestId};
  setJoining(item.id);setError('');
  try{
   const result=await apiPost('/api/giveaway',{action:'join',giveawayId:item.id,stars,requestId},{timeoutMs:15000});
   retry.current=null;
   onBalanceChange?.(result.balance);
   onToast?.('Giveaway qatnashuvi tasdiqlandi!');
   await refresh(true);
  }catch(e){setError(e.message||'Qatnashib bo‘lmadi. Qayta urinib ko‘ring.');}
  finally{setJoining('');}
 };
 const requestJoin=(item,stars)=>{
  if(joining)return;
  if(stars>0){setPending({item,stars});return;}
  void performJoin(item,stars);
 };
 useEffect(()=>{
  if(!pending)return undefined;
  const close=e=>{if(e.key==='Escape')setPending(null);};
  window.addEventListener('keydown',close);
  return()=>window.removeEventListener('keydown',close);
 },[pending]);
 return <div className={styles.root}>
  <div className={styles.topbar}>
   <button type="button" onClick={onBack} aria-label="Orqaga qaytish"><ArrowLeft size={19}/></button>
   <div className={styles.brand}><span className={styles.brandIcon}><Gift size={17}/></span><strong>GIVEAWAY</strong></div>
   <button type="button" onClick={()=>void refresh()} aria-label="Yangilash"><RefreshCcw size={18}/></button>
  </div>
  <div className={styles.pageHeading}>
   <div><span className={styles.overline}>NEWPRO REWARDS</span><h2>{tab==='live'?'Omadingizni sinang':'Natijalar'}</h2></div>
   <span className={styles.activeCount}><span/> {tab==='live'?fmt(active.length)+' faol':fmt(results.length)+' yakunlangan'}</span>
  </div>
  <div className={styles.tabs} role="tablist" aria-label="Giveawaylar">
   <button role="tab" aria-selected={tab==='live'} className={tab==='live'?styles.activeTab:''} type="button" onClick={()=>setTab('live')}>Faol tanlovlar</button>
   <button role="tab" aria-selected={tab==='results'} className={tab==='results'?styles.activeTab:''} type="button" onClick={()=>setTab('results')}>Natijalar</button>
  </div>
  {error?<div className={styles.error} role="alert">{error}<button type="button" onClick={()=>void refresh()}>Yangilash</button></div>:null}
  {loading?<div className={styles.loading}><LoaderCircle className={styles.spinner} size={22}/> Giveawaylar yuklanmoqda...</div>:
  tab==='live'?(main?<div className={styles.sections}>
   <section className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIcon}><Crown size={17}/></span><h2>Asosiy</h2></div><small>Eng muhim tanlov</small></div>
    <EventCard key={main.id} item={main} featured now={now} joining={joining===main.id}
      requestJoin={requestJoin} apiPost={apiPost}/>
   </section>
   {others.length>0?<section className={styles.section}>
    <div className={styles.sectionHeading}><div><span className={styles.sectionIcon}><Gift size={17}/></span><h2>Qolganlar</h2></div>
     <small>{fmt(others.length)} ta tanlov</small></div>
    <div className={styles.otherGrid}>{others.map(g=><EventCard key={g.id} item={g} now={now}
     joining={joining===g.id} requestJoin={requestJoin} apiPost={apiPost}/>)}</div>
   </section>:null}
  </div>:<div className={styles.empty}><span><Gift size={32}/></span><h3>Hozircha faol Giveaway yo‘q</h3>
   <p>Yangi tanlovlar shu yerda paydo bo‘ladi.</p></div>):
  results.length?<div className={styles.otherGrid}>{results.map(g=><EventCard key={g.id} item={g} now={now}
    joining={false} requestJoin={requestJoin} apiPost={apiPost}/>)}</div>:
  <div className={styles.empty}><span><Trophy size={32}/></span><h3>Natijalar hali yo‘q</h3>
   <p>Yakunlangan Giveaway g‘oliblari shu yerda chiqadi.</p></div>}
  {pending?<div className={styles.confirmShade} onMouseDown={e=>{if(e.target===e.currentTarget&&!joining)setPending(null);}}>
   <div className={styles.confirmSheet} role="dialog" aria-modal="true" aria-labelledby="gv-confirm-title">
    <div className={styles.sheetHandle}/>
    <button type="button" className={styles.sheetClose} aria-label="Yopish" onClick={()=>setPending(null)}><X size={20}/></button>
    <span className={styles.confirmIcon}><Star fill="currentColor" size={28}/></span>
    <h3 id="gv-confirm-title">Qatnashishni tasdiqlang</h3>
    <p>{pending.item.title}</p>
    <div className={styles.confirmAmount}><span>Balansdan yechiladi</span><strong>{fmt(pending.stars)} ★</strong></div>
    <button type="button" className={styles.confirmPay} disabled={Boolean(joining)}
     onClick={()=>void performJoin(pending.item,pending.stars)}>
     {joining?'Kutilmoqda…':'Tasdiqlash va qatnashish'}<ArrowRight size={18}/></button>
    <button type="button" className={styles.confirmCancel} onClick={()=>setPending(null)}>Bekor qilish</button>
   </div>
  </div>:null}
 </div>;
}
