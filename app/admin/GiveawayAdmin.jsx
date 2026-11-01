'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {CalendarClock,Check,ChevronDown,CircleAlert,Crown,Gift,Plus,RefreshCcw,ShieldCheck,Sparkles,Trash2,Users,Wallet, X} from 'lucide-react';
import './giveaway-admin.css';

const fmt=n=>new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(Number(n||0));
const when=s=>s?new Date(s).toLocaleString('uz-UZ'):'—';
const defaultEnd=()=>{const d=new Date(Date.now()+86400000);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)};
const initial=()=>({title:'',description:'',mode:'equal',entryPrice:'0',endsAt:defaultEnd(),prizeIds:[''],inventoryConfirmed:false});
const UUID=/^[0-9a-f-]{36}$/i;
export default function GiveawayAdmin({adminKey,giftLibrary=[]}){
 const [form,setForm]=useState(initial);
 const [giveaways,setGiveaways]=useState([]);
 const [paidEnabled,setPaidEnabled]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [notice,setNotice]=useState('');
 const [proofs,setProofs]=useState({});
 const [loaded,setLoaded]=useState(false);
 const validGifts=useMemo(()=>giftLibrary.filter(g=>g.is_active!==false),[giftLibrary]);
 const call=useCallback(async(action,params={})=>{
  const response=await fetch('/api/browser-admin',{
   method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+adminKey},
   body:JSON.stringify({action,...params}),cache:'no-store'
  });
  const json=await response.json().catch(()=>null);
  if(!response.ok||!json?.ok)throw Error(json?.error||'Server xatosi');
  return json;
 },[adminKey]);
 const load=useCallback(async()=>{
  const response=await call('giveaway_list');
  setGiveaways(response.giveaways||[]);
  setPaidEnabled(response.paidEnabled===true);
  setLoaded(true);
 },[call]);
 useEffect(()=>{load().catch(e=>setError(e.message))},[load]);
 const act=async(fn,message)=>{
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try {await fn();await load();if(message)setNotice(message);}
  catch(e){setError(e.message||'Xatolik yuz berdi');}
  finally{setBusy(false);}
 };
 const create=async(event)=>{
  event.preventDefault();
  if(!form.inventoryConfirmed){setError('Sovrinlar haqiqatan mavjudligini tasdiqlang.');return;}
  if(form.prizeIds.some(id=>!UUID.test(id))){setError('Har bir o‘rin uchun Gift bazadan sovg‘a tanlang.');return;}
  await act(async()=>{
   await call('giveaway_create',{
    title:form.title,description:form.description,mode:form.mode,
    entryPrice:Number(form.entryPrice),endsAt:new Date(form.endsAt).toISOString(),
    prizeIds:form.prizeIds,inventoryConfirmed:form.inventoryConfirmed
   });
   setForm(initial());
  },'Giveaway draft yaratildi. Tekshirib, alohida E’lon qilish tugmasini bosing.');
 };
 const updatePrize=(index,value)=>setForm(f=>({...f,prizeIds:f.prizeIds.map((g,i)=>i===index?value:g)}));
 const action=(name,id,question,success)=>{
  if(!window.confirm(question))return;
  void act(()=>call('giveaway_'+name,{id}),success);
 };
 const deliver=(prize)=>{
  const note=(proofs[prize.id]||'').trim();
  if(note.length<8){setError('Yetkazish dalili kamida 8 belgi bo‘lishi kerak.');return;}
  if(!window.confirm('Telegram gift yuborilganini tasdiqlaysizmi? Bu yozuv qaytarilmaydi.'))return;
  void act(()=>call('giveaway_deliver',{prizeId:prize.id,note}),'Sovrin yetkazildi deb qayd etildi.');
 };
 return <section className="ga-root">
  <header className="ga-header"><div><span className="ga-eyebrow">NEWPRO / COMMUNITY EVENTS</span><h2>Giveaway Studio</h2>
   <p>Har bir o‘rin uchun alohida gift, kirish narxi, tugash sanasi va shaffof tanlov qoidalari.</p></div>
   <button type="button" className="ga-refresh" disabled={busy} onClick={()=>act(()=>load())}><RefreshCcw size={16}/> Yangilash</button>
  </header>
  {error?<div className="ga-alert" role="alert"><CircleAlert size={17}/>{error}</div>:null}
  {notice?<div className="ga-note" role="status"><Check size={17}/>{notice}</div>:null}
  <div className="ga-columns">
   <form className="ga-creator" onSubmit={create}>
    <div className="ga-section-title"><span className="ga-section-icon"><Plus size={19}/></span><div><h3>Yangi Giveaway</h3><small>Avval draft yaratiladi, o‘zi ishga tushmaydi</small></div></div>
    <label>Nomi<input required maxLength={90} minLength={4} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Masalan: Diamond Gift Giveaway"/></label>
    <label>Qisqacha tavsif<textarea maxLength={700} rows={3} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Ishtirok shartlari va sovrinlar haqida"/></label>
    <div className="ga-mode-picker">
     <button type="button" className={form.mode==='equal'?'active':''} onClick={()=>setForm({...form,mode:'equal'})}>
      <Users size={20}/><strong>Teng imkoniyat</strong><small>Har bir foydalanuvchiga 1 imkoniyat</small></button>
     <button type="button" className={form.mode==='weighted'?'active':''} onClick={()=>setForm({...form,mode:'weighted',entryPrice:form.entryPrice==='0'?'1':form.entryPrice})}>
      <Sparkles size={20}/><strong>Stars vaznli</strong><small>Ko‘proq Stars → yuqoriroq ehtimol</small></button>
    </div>
    <div className="ga-form-row"><label>{form.mode==='weighted'?'Minimal Stars tikish':'Kirish narxi (0 = bepul)'}
       <input type="number" min={form.mode==='weighted'?1:0} max={10000} step={1} required
         value={form.entryPrice} onChange={e=>setForm({...form,entryPrice:e.target.value})}/></label>
     <label>Tugash vaqti<input type="datetime-local" required value={form.endsAt} onChange={e=>setForm({...form,endsAt:e.target.value})}/></label>
    </div>
    <div className="ga-prizes-head"><div><h4>Sovrinli o‘rinlar</h4><p>1-o‘rin, 2-o‘rin va hokazo — har biriga bitta gift</p></div>
      <button type="button" disabled={form.prizeIds.length>=10} onClick={()=>setForm(f=>({...f,prizeIds:[...f.prizeIds,'']}))}><Plus size={15}/> O‘rin</button></div>
    <div className="ga-prize-inputs">{form.prizeIds.map((id,i)=>{
      const gift=validGifts.find(g=>g.id===id);
      return <div className="ga-prize-row" key={i}><span className="ga-place">{i+1}</span>
        {gift?.image_url?<img src={gift.image_url} alt="" loading="lazy" />:<span className="ga-gift-fallback"><Gift size={19}/></span>}
        <select required aria-label={(i+1)+'-o‘rin sovg‘asi'} value={id} onChange={e=>updatePrize(i,e.target.value)}>
         <option value="">Giftni tanlang</option>{validGifts.map(g=><option key={g.id} value={g.id}>{g.title}</option>)}
        </select>
        <button type="button" disabled={form.prizeIds.length<=1} aria-label="O‘rinni olib tashlash"
        onClick={()=>setForm(f=>({...f,prizeIds:f.prizeIds.filter((_,index)=>index!==i)}))}><Trash2 size={15}/></button>
      </div>;
    })}</div>
    <label className="ga-confirm"><input type="checkbox" checked={form.inventoryConfirmed}
     onChange={e=>setForm({...form,inventoryConfirmed:e.target.checked})}/>
     <span>Sovrinlar real zaxirada borligini va g‘oliblarga Telegram orqali o‘zim yetkazishimni tasdiqlayman.</span></label>
    <div className="ga-compliance"><ShieldCheck size={18}/><span>Pullik yoki Stars vaznli tanlovlar qonunchilik va Telegram qoidalari tekshirilmaguncha faol emas. {paidEnabled?'Pullik rejim uchun server ruxsati yoqilgan.':'Serverda pullik rejim bloklangan.'}</span></div>
    <button type="submit" className="ga-primary" disabled={busy||!form.inventoryConfirmed||!validGifts.length}>
      <Plus size={17}/>{busy?'Saqlanmoqda…':'Draft yaratish'}</button>
   </form>
   <div className="ga-existing">
    <div className="ga-section-title"><span className="ga-section-icon"><Crown size={19}/></span><div><h3>Giveawaylar</h3><small>{giveaways.length} ta tadbir · holat va yetkazish nazorati</small></div></div>
    {!loaded?<p className="ga-empty">Ro‘yxat yuklanmoqda…</p>:null}
    {loaded&&!giveaways.length?<p className="ga-empty">Hali Giveaway yaratilmagan.</p>:null}
    <div className="ga-list">{giveaways.map(g=><article className="ga-event" key={g.id}>
      <div className="ga-event-top"><span className={'ga-status '+g.status}>{g.status.toUpperCase()}</span>
       <span className="ga-mode">{g.mode==='weighted'?'Vaznli':'Teng'} · {g.entry_price?fmt(g.entry_price)+' ★':'Bepul'}</span></div>
      <h4>{g.title}</h4><p>{g.description}</p>
      <div className="ga-details"><span><Users size={14}/> {fmt(g.members)} qatnashchi</span>
       <span><Wallet size={14}/> {fmt(g.totalStars)} ★</span>
       <span><CalendarClock size={14}/> {when(g.ends_at)}</span></div>
      <div className="ga-awards">{(g.prizes||[]).map(p=><div key={p.id} className="ga-award">
        {p.giftImageUrl?<img src={p.giftImageUrl} alt="" loading="lazy"/>:<Gift size={22}/>}
        <div><strong>{p.place}-o‘rin · {p.giftTitle}</strong>
         <small>{p.winnerId?('G‘olib: '+(p.winnerName||p.winnerUsername||p.winnerId)):'G‘olib aniqlanmagan'}</small>
         {p.winnerId?<small className={p.deliveryStatus==='delivered'?'ga-delivered':'ga-pending'}>{p.deliveryStatus==='delivered'?'✓ Yetkazilgan':'● Yetkazilishi kutilmoqda'}</small>:null}
        </div>
        {p.winnerId&&p.deliveryStatus==='pending'?<div className="ga-deliver">
         <input value={proofs[p.id]||''} maxLength={500} onChange={e=>setProofs(o=>({...o,[p.id]:e.target.value}))}
           placeholder="Yuborish dalili / tranzaksiya ID"/>
         <button type="button" disabled={busy||(proofs[p.id]||'').trim().length<8} onClick={()=>deliver(p)}>Tasdiqlash</button>
        </div>:null}
       </div>)}</div>
      <div className="ga-event-actions">
       {g.status==='draft'?<button disabled={busy||((g.entry_price>0||g.mode==='weighted')&&!paidEnabled)}
          type="button" className="ga-publish" onClick={()=>action('publish',g.id,'Giveawayni hammaga e’lon qilasizmi?','Giveaway e’lon qilindi!')}>E’lon qilish</button>:null}
       {g.status==='live'?<button disabled={busy||new Date(g.ends_at)>new Date()} type="button"
          onClick={()=>action('draw',g.id,'Muddat tugagan Giveaway g‘oliblarini aniqlaysizmi?','G‘oliblar aniqlanib saqlandi.')}>G‘oliblarni aniqlash</button>:null}
       {['draft','live'].includes(g.status)?<button type="button" disabled={busy} className="ga-danger"
          onClick={()=>action('cancel',g.id,'Bekor qilinsinmi? Sarflangan Stars avtomatik qaytariladi.','Giveaway bekor qilindi, Stars qaytarildi.')}>Bekor qilish</button>:null}
       {g.status==='completed'?<span className="ga-commit">Seed: {g.seed_secret||'—'} · Hash: {g.seed_commit}</span>:null}
      </div>
     </article>)}</div>
   </div>
  </div>
 </section>;
}
