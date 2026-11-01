'use client';
import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Check,CheckCircle2,Clock3,Crown,Gift,LoaderCircle,LockKeyhole,RefreshCcw,ShieldCheck,Sparkles,Star,Ticket,Users,Wallet} from 'lucide-react';
import styles from './GiveawayHub.module.css';

const fmt=n=>new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(Number(n||0));
const msLeft=v=>Math.max(0,Date.parse(v)-Date.now());
const remaining=ms=>{
 const s=Math.floor(ms/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),sec=s%60;
 return d?d+'d '+h+'h '+m+'m':h?h+'h '+m+'m '+sec+'s':m+'m '+sec+'s';
};
const thisId=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():null;

function PrizeArt({prize}) {
 const [failed,setFailed]=useState(false);
 return <span className={styles.prizeArt}>
  {prize?.imageUrl&&!failed?<img src={prize.imageUrl} alt={prize.title||'Gift'} loading="lazy" onError={()=>setFailed(true)}/>:<Gift size={35}/>}
 </span>;
}
function DrawCard({item,submit,joining,paidEnabled}) {
 const [stars,setStars]=useState(String(item.price||0));
 const [now,setNow]=useState(Date.now());
 useEffect(()=>setStars(String(item.price||0)),[item.id,item.price]);
 useEffect(()=>{const h=window.setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(h);},[]);
 const ended=Date.parse(item.endsAt)<=now;
 const active=item.status==='live'&&!ended;
 const completed=item.status==='completed';
 const weighted=item.mode==='weighted';
 const participating=Number(item.myWeight||0)>0;
 const totalWeight=Number(item.totalWeight||0);
 const meWeight=Number(item.myWeight||0);
 const paid=(item.price||0)>0||weighted;
 const permitted=!paid||paidEnabled;
 const amount=Number(stars);
 const valid=Number.isSafeInteger(amount)&&amount>=Number(item.price||0)&&amount<=10000&&
  (weighted?amount>0:amount===Number(item.price||0));
 const ownChance=totalWeight?100*meWeight/totalWeight:0;
 return <article className={styles.event}>
   <div className={styles.eventTop}>
     <span className={styles.flag}><Star size={13}/>{weighted?'STARS WEIGHTED':'EQUAL CHANCE'}</span>
     <span className={styles.state} data-closed={completed||ended}>{completed?'YAKUNLANGAN':ended?'NATIJA KUTILMOQDA':'● LIVE'}</span>
   </div>
   <h3>{item.title}</h3>
   {item.description?<p className={styles.description}>{item.description}</p>:null}
   <div className={styles.eventStats}>
     <span><Users size={14}/> {fmt(item.participants)} ishtirokchi</span>
     <span><Crown size={14}/> {item.prizes?.length||0} ta o‘rin</span>
     <span><Clock3 size={14}/> {completed?'Yakunlangan':remaining(msLeft(item.endsAt))}</span>
   </div>
   <div className={styles.prizes}>
    {(item.prizes||[]).map(p=><div className={styles.prize} key={p.id}>
     <div className={styles.place}><Crown size={13}/>{p.place}</div>
     <PrizeArt prize={p}/>
     <div className={styles.prizeCopy}><strong>{p.title}</strong>
       {completed?<small>{p.winner?('G‘olib: '+p.winner):'G‘olib yo‘q'}
         {p.myWin?' · SIZ YUTDINGIZ!':''}</small>:<small>{p.place}-o‘rin sovrini</small>}</div>
    </div>)}
   </div>
   <div className={styles.rules}>
    <span><ShieldCheck size={16}/> SHAFFOF TANLOV</span>
    <p>{weighted?'Har 1 Stars = 1 imkoniyat vazni. Har bir yangi tikish ehtimolni oshiradi. G‘oliblar takrorlanmasdan tasodifiy tanlanadi.'
      :'Har bir odam bitta ishtirok huquqiga ega. Barcha qatnashchilarning imkoniyati teng. G‘oliblar tasodifiy tanlanadi.'}</p>
    <small>{weighted?'Hozirgi 1-o‘rin ehtimolingiz: '+(ownChance?ownChance.toFixed(2):'0')+'%. Qatnashchilar qo‘shilsa o‘zgaradi.'
      :'Bir foydalanuvchi — bir imkoniyat. Ko‘proq Stars tikish ehtimolni o‘zgartirmaydi.'}</small>
    <small>Tanlov hash: {String(item.seedCommit||'').slice(0,16)}…</small>
    {completed&&item.seedReveal?<small className={styles.seed}>Tekshiruv uchun seed: {item.seedReveal}</small>:null}
   </div>
   {participating?<div className={styles.joined}><CheckCircle2 size={17}/>
    <span>Qatnashyapsiz{weighted?' · Jami tikilgan: '+fmt(item.myStars)+' ★ · Vazningiz: '+fmt(item.myWeight):''}</span>
   </div>:null}
   {active&&permitted? <div className={styles.joinBox}>
    {weighted?<label className={styles.stakeLabel}>Necha Stars tikmoqchisiz?
      <div className={styles.stakeInput}><Star size={16}/><input type="number" min={item.price} max={10000} step="1"
         inputMode="numeric" value={stars} onChange={e=>setStars(e.target.value)}/><span>★</span></div>
      <small>Minimum {fmt(item.price)} ★ · maksimum 10 000 ★ bir martada</small>
     </label>:<div className={styles.entryInfo}><span>Kirish</span><strong>{item.price?fmt(item.price)+' ★':'BEPUL'}</strong></div>}
    <button className={styles.joinButton} type="button"
      disabled={joining||!valid||(!weighted&&participating)}
      onClick={()=>submit(item,amount)}>
      {joining?<LoaderCircle className={styles.spinner} size={17}/>:<Ticket size={18}/>}
      {weighted?(participating?'Yana Stars qo‘shish':'Stars bilan qatnashish'):(participating?'Ro‘yxatga olindingiz':'Qatnashish')}
      <ArrowRight size={17}/>
    </button>
   </div>:null}
   {active&&!permitted?<div className={styles.unavailable}><LockKeyhole size={17}/>
     Pullik giveaway qatnashuvi hozircha vaqtincha yopiq.</div>:null}
   {completed&&item.prizes?.some(p=>p.myWin&&p.deliveryStatus==='pending')?<div className={styles.joined}>
     <Gift size={17}/> Yutuq aniqlandi! Admin sovg‘ani Telegram orqali yetkazadi.</div>:null}
  </article>;
}
export default function GiveawayHub({apiPost,onBack,onBalanceChange,onToast}){
 const [data,setData]=useState({giveaways:[],paidEnabled:false});
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [filter,setFilter]=useState('live');
 const [joining,setJoining]=useState('');
 const retry=useRef(null);
 const refresh=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);
  try{
    const result=await apiPost('/api/giveaway',{action:'list'},{timeoutMs:15000});
    setData(result);
    setError('');
    if(Number.isFinite(Number(result.balance)))onBalanceChange?.(Number(result.balance));
  }catch(e){if(!silent)setError(e.message||'Server bilan aloqa uzildi');}
  finally{if(!silent)setLoading(false)}
 },[apiPost,onBalanceChange]);
 useEffect(()=>{void refresh();const id=setInterval(()=>{
   if(document.visibilityState==='visible')void refresh(true);
 },20000);return()=>clearInterval(id);},[refresh]);
 const filtered=useMemo(()=>data.giveaways.filter(g=>filter==='all'||(filter==='live'?g.status==='live':g.status==='completed')),[data,filter]);
 const submit=async(giveaway,stars)=>{
  if(joining)return;
  if(stars>0&&!window.confirm(fmt(stars)+' Stars ichki balansingizdan yechiladi. Qatnashishni tasdiqlaysizmi?'))return;
  const old=retry.current;
  const requestId=old?.id===giveaway.id&&old?.stars===stars?old.requestId:thisId();
  if(!requestId){setError('Bu qurilma xavfsiz so‘rov ID yaratolmaydi.');return;}
  retry.current={id:giveaway.id,stars,requestId};
  setJoining(giveaway.id);setError('');
  try{
   const result=await apiPost('/api/giveaway',{action:'join',giveawayId:giveaway.id,stars,requestId},{timeoutMs:15000});
   retry.current=null;
   onBalanceChange?.(result.balance);
   onToast?.('Giveaway qatnashuvi tasdiqlandi!');
   await refresh(true);
  }catch(e){
   setError(e.message||'Qatnashib bo‘lmadi. Qayta urinishda ayni so‘rov tekshiriladi.');
  }finally{setJoining('');}
 };
 return <div className={styles.root}>
  <div className={styles.topbar}><button type="button" onClick={onBack} aria-label="Orqaga qaytish"><ArrowLeft size={19}/></button>
   <span>NEWPRO <b>GIVEAWAY</b></span>
   <button type="button" onClick={()=>refresh()} aria-label="Yangilash"><RefreshCcw size={18}/></button></div>
  <header className={styles.hero}><span className={styles.heroHighlight}/>
   <div className={styles.heroContent}><span className={styles.kicker}><Sparkles size={14}/> COMMUNITY REWARDS</span>
    <h1>GIVE<span>AWAY</span></h1><p>Ishtirok eting. Omadingizni sinang. Telegram giftlarni yuting.</p>
    <span className={styles.heroTag}><Gift size={14}/> {fmt(data.giveaways.filter(x=>x.status==='live').length)} faol tanlov</span>
   </div><Gift className={styles.heroGift} size={126} strokeWidth={1.25}/></header>
  <section className={styles.intro}><div><span className={styles.eyebrow}>TWO FAIR MODES</span><h2>Giveawaylar</h2>
    <p>Teng imkoniyat va Stars bo‘yicha vaznli tanlovlar. Har bir sovrin va g‘olib holati ochiq.</p></div>
    <div className={styles.tabs}>{[['live','Faol'],['completed','Natijalar'],['all','Barchasi']].map(([key,label])=>
      <button key={key} className={filter===key?styles.active:''} type="button" onClick={()=>setFilter(key)}>{label}</button>)}</div>
  </section>
  {error?<div className={styles.error} role="alert">{error}<button type="button" onClick={()=>refresh()}>Qayta yuklash</button></div>:null}
  {loading?<div className={styles.loading}><LoaderCircle className={styles.spinner} size={23}/> Giveawaylar yuklanmoqda...</div>:
   filtered.length?<div className={styles.grid}>{filtered.map(g=><DrawCard key={g.id} item={g} submit={submit} joining={joining===g.id}
    paidEnabled={data.paidEnabled}/>)}</div>:
   <div className={styles.empty}><span><Gift size={32}/></span><h3>Hozircha {filter==='live'?'faol ':''}Giveaway yo‘q</h3>
     <p>Admin sovg‘alar va o‘rinlarni tanlab yangi Giveaway e’lon qilganda, shu yerda ko‘rinadi.</p></div>}
  <footer className={styles.foot}><ShieldCheck size={15}/> Sovrinlar g‘oliblarga admin tomonidan Telegram orqali yetkaziladi. Natijalar va tasodifiy tanlovga oid ma’lumotlar saqlanadi.</footer>
 </div>;
}
