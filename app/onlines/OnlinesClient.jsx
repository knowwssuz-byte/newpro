'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3,
  CheckCircle2, ChevronRight, CircleAlert, Clock3, Copy, Database, Dice5,
  Gamepad2, Gift, Layers3, LockKeyhole, LogOut, Radio, RefreshCcw,
  Rocket, Search, ShieldCheck, Sparkles, Swords, TrendingUp, UserRound,
  UserRoundCheck, Users, Wallet, X
} from 'lucide-react';
import './onlines.css';

const SECTIONS = [
  ['color','Color Arena',Swords],['xo','X/O Duel',Gamepad2],
  ['rocket','Rocket',Rocket],['dice','Dice',Dice5],
  ['upgrade','Upgrade',TrendingUp],['case','Case',Gift],['giveaway','Giveaway',Gift],
  ['pvp','PvP Lobby',Layers3],['games','Games',Gamepad2],
  ['home','Home',Layers3],['inventory','Inventory',Wallet],
  ['bonus','Bonus',Sparkles],['deposit','Deposit',ArrowDownRight],
  ['referral','Referral',Users],['history','History',Clock3],
  ['profile','Profile',UserRound],['other','Other',Activity]
];
const sectionName = key => SECTIONS.find(x=>x[0]===key)?.[1] || 'Boshqa bo‘lim';
const money = n => new Intl.NumberFormat('uz-UZ',{maximumFractionDigits:2}).format(Number(n||0));
const time = s => s ? new Date(s).toLocaleString('uz-UZ',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const delayAgo = s => {
  if (!s) return 'Faollik aniqlanmagan';
  const diff=Math.max(0,Math.floor((Date.now()-new Date(s).getTime())/1000));
  if (diff<60)return diff+' soniya oldin';
  if (diff<3600)return Math.floor(diff/60)+' daqiqa oldin';
  return time(s);
};
function Initials({name}) {
  return <span className="ol-avatar">{(name||'N').trim().slice(0,1).toUpperCase()}</span>;
}
function MiniMetric({icon:Icon,title,value,extra,tone=''}) {
  return <div className={'ol-metric '+tone}><span className="ol-metric-icon"><Icon size={18}/></span>
    <span className="ol-metric-title">{title}</span><strong>{value}</strong>
    <span className="ol-metric-extra">{extra}</span></div>;
}
function UserDetail({detail,onClose,onRefresh,loading}) {
  const [tab,setTab]=useState('activity');
  useEffect(()=>setTab('activity'),[detail?.user?.id]);
  useEffect(()=>{
    const esc=e=>{if(e.key==='Escape')onClose();};
    document.addEventListener('keydown',esc);
    return()=>document.removeEventListener('keydown',esc);
  },[onClose]);
  if (!detail && !loading)return null;
  const user=detail?.user||{};
  const stats=detail?.insights||{};
  const deposit=stats.deposits||{};
  const withdraw=stats.giftWithdrawals||{};
  const gameplay=[
    ['Case', stats.case?.played, 'Sotilgan: '+money(stats.case?.sold), Gift],
    ['Dice',stats.dice?.played,'Won: '+money(stats.dice?.won),Dice5],
    ['Rocket',stats.rocket?.played,'Cashed out: '+money(stats.rocket?.cashedOut),Rocket],
    ['Color Arena',stats.colorArena?.bets,'Tikilgan: '+money(stats.colorArena?.stake)+' ★',Swords],
    ['X/O Duel',stats.xoDuel?.matches,'Yakunlangan: '+money(stats.xoDuel?.finished),Gamepad2],
    ['Upgrade',stats.upgrade?.played,'Won: '+money(stats.upgrade?.won),TrendingUp],
  ];
  return <div className="ol-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}>
    <aside className="ol-detail" role="dialog" aria-modal="true" aria-label="Foydalanuvchi statistikasi">
      <div className="ol-detail-top"><div><span className="ol-eyebrow">MEMBER INTELLIGENCE</span><h2>Foydalanuvchi profili</h2></div>
        <div className="ol-icon-actions">
          <button type="button" onClick={onRefresh} title="Yangilash"><RefreshCcw size={18}/></button>
          <button type="button" onClick={onClose} title="Yopish" aria-label="Yopish"><X size={19}/></button>
        </div>
      </div>
      {loading&&!detail?<div className="ol-detail-wait"><span className="ol-spin"/><p>Haqiqiy o‘yin tarixi yuklanmoqda…</p></div>:<div className="ol-detail-content">
        <div className="ol-user-heading"><Initials name={user.first_name||user.username}/>
          <div><h3>{user.first_name||user.username||'Telegram foydalanuvchisi'}</h3><p>{user.username?'@'+user.username:'Username yo‘q'} · ID {user.id}</p>
            <span className={'ol-state '+(detail?.presence?.online?'online':'offline')}>{detail?.presence?.online?'● Online · '+sectionName(detail.presence.section):'○ Offline'}</span>
          </div></div>
        <div className="ol-user-meta"><span>Ro‘yxatdan o‘tgan: <b>{time(user.created_at)}</b></span>
          <span>Oxirgi faollik: <b>{time(detail?.presence?.lastSeenAt)}</b></span>
          <span>Account: <b>{user.is_banned?'Bloklangan':'Faol'}</b></span>
          <span>Level XP: <b>{money(user.level_xp)}</b></span></div>
        <h4 className="ol-subhead">Moliya va balans</h4>
        <div className="ol-detail-stats">
          <MiniMetric icon={Wallet} title="Joriy balans" value={money(user.balance)+' ★'} extra="O‘yin ichidagi Stars"/>
          <MiniMetric icon={ArrowDownRight} title="Kiritilgan balans" value={money(deposit.creditedStars)+' ★'} extra={money(deposit.completed)+' ta yakunlangan deposit'} tone="mint"/>
          <MiniMetric icon={TrendingUp} title="TON orqali to‘langan" value={money(deposit.tonPaid)+' TON'} extra="Faqat tasdiqlangan to‘lovlar"/>
          <MiniMetric icon={Gift} title="Yechilgan giftlar" value={money(withdraw.approved)} extra={money(withdraw.pending)+' kutilmoqda · '+money(withdraw.rejected)+' rad etilgan'}/>
        </div>
        <p className="ol-finance-note">Yechish: gift so‘rovlari soni, pul summasi emas. Dice/Rocket yutuqlari ichki Stars hisoblanadi, haqiqiy pul yechimi emas.</p>
        <div className="ol-game-money">
          <div><span>Dice tikishlar</span><strong>{money(stats.dice?.bet)} ★</strong><small>To‘lov: {money(stats.dice?.payout)} ★</small></div>
          <div><span>Rocket tikishlar</span><strong>{money(stats.rocket?.bet)} ★</strong><small>To‘lov: {money(stats.rocket?.payout)} ★</small></div>
          <div><span>Case sotilgan</span><strong>{money(stats.case?.soldForStars)} ★</strong><small>Ichki Stars</small></div>
          <div><span>Client xatolari</span><strong>{money(stats.errors)}</strong><small>Qayd etilgan</small></div>
        </div>
        <h4 className="ol-subhead">O‘yinlardagi faoliyat</h4>
        <div className="ol-game-list">{gameplay.map(([name,count,extra,Icon])=>
          <div key={name}><span className="ol-game-icon"><Icon size={18}/></span><div><strong>{name}</strong><small>{extra}</small></div>
            <b>{money(count)} <small>marta</small></b></div>)}</div>
        <div className="ol-detail-tabs" role="tablist">
          {[['activity','Harakatlar'],['deposits','Depositlar'],['withdrawals','Yechishlar'],['errors','Xatolar']].map(([id,label])=>
            <button role="tab" aria-selected={tab===id} className={tab===id?'active':''} type="button" key={id} onClick={()=>setTab(id)}>{label}</button>)}
        </div>
        {tab==='activity'?<div className="ol-events">{(detail.events||[]).length?detail.events.map(e=>
          <div key={e.id}><span className="ol-event-dot"/><div><strong>{e.title}</strong><p>{e.info||'Harakat'}</p></div><time>{time(e.createdAt)}</time></div>):<p className="ol-empty">Hozircha tarix yo‘q.</p>}</div>:null}
        {tab==='deposits'?<div className="ol-events">{(detail.recentDeposits||[]).map(d=>
          <div key={d.id}><span className="ol-event-dot"/><div><strong>{d.method||'Deposit'} · {d.status}</strong><p>{money(d.pay_amount)} {d.pay_currency||''} → {money(d.credit_amount)} Stars</p></div><time>{time(d.created_at)}</time></div>)}
          {!detail.recentDeposits?.length?<p className="ol-empty">Depositlar yo‘q</p>:null}</div>:null}
        {tab==='withdrawals'?<div className="ol-events">{(detail.recentWithdrawals||[]).map(d=>
          <div key={d.id}><span className="ol-event-dot"/><div><strong>Gift · {d.status}</strong><p>{d.admin_note||'Izoh mavjud emas'}</p></div><time>{time(d.created_at)}</time></div>)}
          {!detail.recentWithdrawals?.length?<p className="ol-empty">Yechish so‘rovlari yo‘q</p>:null}</div>:null}
        {tab==='errors'?<div className="ol-events">{(detail.recentFailures||[]).map(e=>
          <div key={e.id}><span className="ol-event-dot error"/><div><strong>{sectionName(e.section)}</strong><p>{e.message}</p></div><time>{time(e.created_at)}</time></div>)}
          {!detail.recentFailures?.length?<p className="ol-empty">Ilovadan xato qaydlari kelmagan. Oldingi server xatolari bu jadvalga kirmaydi.</p>:null}</div>:null}
        <p className="ol-detail-foot">O‘yinlar soni bazadagi barcha tarixiy yozuvlardan, harakatlar lentasi esa so‘nggi yozuvlardan shakllantirilgan.</p>
      </div>}
    </aside>
  </div>;
}
export default function OnlinesClient({initiallyAuthorized=false}) {
  const [authed,setAuthed]=useState(initiallyAuthorized);
  const [key,setKey]=useState('');
  const [loginBusy,setLoginBusy]=useState(false);
  const [loginError,setLoginError]=useState('');
  const [data,setData]=useState(null);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [status,setStatus]=useState('all');
  const [draftSearch,setDraftSearch]=useState('');
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(1);
  const [selected,setSelected]=useState('');
  const [detail,setDetail]=useState(null);
  const [detailBusy,setDetailBusy]=useState(false);
  const [lastUpdated,setLastUpdated]=useState(null);
  useEffect(()=>{const t=setTimeout(()=>{setSearch(draftSearch.trim());setPage(1);},320);return()=>clearTimeout(t)},[draftSearch]);
  const refresh=useCallback(async(silent=false)=>{
    if(!authed)return;
    if(!silent)setBusy(true);
    try {
      const params=new URLSearchParams({status,page:String(page),q:search});
      const response=await fetch('/api/onlines?'+params,{cache:'no-store'});
      if(response.status===401){setAuthed(false);setData(null);return;}
      const json=await response.json();
      if(!json.ok)throw new Error(json.error||'Server xatosi');
      setData(json);setError('');setLastUpdated(new Date());
    }catch(err){setError(err.message||'Ma’lumot kelmadi');}
    finally{setBusy(false);}
  },[authed,page,search,status]);
  const openUser=useCallback(async(id)=>{
    setSelected(String(id));setDetail(null);setDetailBusy(true);
    window.history.replaceState(null,'','/onlines?user='+encodeURIComponent(id));
    try{
      const response=await fetch('/api/onlines?mode=detail&user='+encodeURIComponent(id),{cache:'no-store'});
      if(response.status===401){setAuthed(false);return;}
      const json=await response.json();
      if(!json.ok)throw new Error(json.error||'Foydalanuvchi topilmadi');
      setDetail(json);setError('');
    }catch(err){setError(err.message);}finally{setDetailBusy(false);}
  },[]);
  const closeUser=useCallback(()=>{
    setSelected('');setDetail(null);
    window.history.replaceState(null,'','/onlines');
  },[]);
  useEffect(()=>{
    if(!authed)return;
    void refresh(false);
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh(true);},10000);
    return()=>clearInterval(timer);
  },[authed,refresh]);
  useEffect(()=>{
    if(authed&&!selected){
      const param=new URLSearchParams(window.location.search).get('user');
      if(param && /^\d{1,16}$/.test(param))void openUser(param);
    }
  },[authed,selected,openUser]);
  const signIn=async(e)=>{
    e.preventDefault();setLoginError('');setLoginBusy(true);
    try{
      const response=await fetch('/api/onlines/auth',{
        method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'login',key}),cache:'no-store'
      });
      const json=await response.json();if(!json.ok)throw new Error(json.error||'Ruxsat yo‘q');
      setKey('');setAuthed(true);
    }catch(err){setLoginError(err.message||'Admin kalit noto‘g‘ri');}
    finally{setLoginBusy(false);}
  };
  const logout=async()=>{
    await fetch('/api/onlines/auth',{method:'POST',headers:{'content-type':'application/json'},
      body:JSON.stringify({action:'logout'})}).catch(()=>{});
    setAuthed(false);setData(null);setSelected('');setDetail(null);
  };
  const totals=data?.overview?.bySection||{};
  const online=Number(data?.overview?.total||0);
  const maxSection=Math.max(1,...Object.values(totals).map(Number));
  const pages=Math.max(1,Math.ceil(Number(data?.resultCount||0)/30));
  return <main className="ol-shell">
    {!authed?<div className="ol-login-wrap">
      <div className="ol-login-orb"><ShieldCheck size={29}/></div>
      <div className="ol-login-panel">
        <span className="ol-eyebrow">NEWPRO · PRIVATE OPERATIONS</span>
        <h1>Control Center<span>.</span></h1>
        <p>Online monitoring, foydalanuvchi statistikasi va harakatlar auditi. Faqat admin uchun.</p>
        <form onSubmit={signIn}><label htmlFor="ol-secret">Admin kalit</label>
          <div className="ol-secret-input"><LockKeyhole size={18}/><input id="ol-secret" type="password"
            autoComplete="off" value={key} onChange={e=>setKey(e.target.value)}
            required minLength={1} placeholder="Maxfiy admin kalitni kiriting" /></div>
          {loginError?<span className="ol-login-error">{loginError}</span>:null}
          <button disabled={loginBusy||!key.trim()} type="submit">
            {loginBusy?'Tekshirilmoqda…':'Admin panelga kirish'}<ArrowRight size={17}/></button>
        </form>
        <div className="ol-login-security"><ShieldCheck size={17}/> Maxfiy sessiya · 8 soat · HTTP-only cookie</div>
      </div>
      <span className="ol-login-bottom">NEWPRO CONTROL · SECURE ENVIRONMENT</span>
    </div>:<>
      <header className="ol-header">
        <div className="ol-brand"><span className="ol-brand-mark"><Activity size={23}/></span>
          <div><strong>newpro<span>.</span> <small>CONTROL</small></strong><small>ADMIN INTELLIGENCE</small></div></div>
        <div className="ol-header-actions">
          <span className="ol-live-chip"><span/> LIVE MONITORING</span>
          <button type="button" onClick={()=>refresh(false)} aria-label="Yangilash" title="Yangilash"><RefreshCcw size={18} className={busy?'ol-spin-icon':''}/></button>
          <button type="button" onClick={logout} aria-label="Chiqish" title="Chiqish"><LogOut size={18}/></button>
        </div>
      </header>
      <div className="ol-content">
        <div className="ol-page-title"><div><span className="ol-eyebrow">REAL-TIME OVERVIEW / 01</span>
          <h1>Onlines <span>& Analytics</span></h1>
          <p>Haqiqiy Telegram sessiyalari, umumiy auditoriya va barcha o‘yinlar bo‘yicha statistika.</p></div>
          <div className="ol-time-note"><Clock3 size={15}/>{lastUpdated?'Yangilandi: '+time(lastUpdated):'Ulanmoqda…'}<small>Har 10 soniyada</small></div>
        </div>
        {error?<div className="ol-alert" role="alert"><CircleAlert size={18}/>{error}
          <button type="button" onClick={()=>refresh(false)}>Qayta urinish</button></div>:null}
        <div className="ol-summary">
          <MiniMetric icon={Radio} title="Hozir online" value={money(online)}
            extra="Oxirgi 65 soniyada faol" tone="violet"/>
          <MiniMetric icon={Users} title="Jami obunachilar" value={money(data?.totalUsers)}
            extra="Telegram orqali ro‘yxatdan o‘tganlar"/>
          <MiniMetric icon={Gamepad2} title="O‘yinlarda" value={money(['color','xo','rocket','dice','upgrade','case'].reduce((a,k)=>a+Number(totals[k]||0),0))}
            extra="Faol o‘yin sessiyalari" tone="mint"/>
          <MiniMetric icon={Activity} title="Faol bo‘limlar" value={money(Object.values(totals).filter(v=>Number(v)>0).length)}
            extra="Jonli faollik aniqlangan sahifalar"/>
        </div>
        <section className="ol-game-panel">
          <div className="ol-section-head"><div><span className="ol-eyebrow">LIVE DISTRIBUTION</span>
            <h2>O‘yin va bo‘limlar bo‘yicha online</h2></div><span className="ol-panel-note">Unikal foydalanuvchilar · oxirgi 65 s</span></div>
          <div className="ol-section-grid">{SECTIONS.map(([id,label,Icon])=>{
            const value=Number(totals[id]||0);
            return <div className="ol-section-card" key={id}>
              <span className="ol-section-icon"><Icon size={18}/></span>
              <div className="ol-section-info"><strong>{label}</strong><span>{money(value)} online</span></div>
              <b>{money(value)}</b>
              <div className="ol-section-track"><span style={{width:Math.max(value?5:0,value/maxSection*100)+'%'}}/></div>
            </div>
          })}</div>
        </section>
        <section className="ol-users-panel">
          <div className="ol-section-head"><div><span className="ol-eyebrow">MEMBER DIRECTORY</span>
            <h2>Barcha obunachilar</h2></div>
            <span className="ol-panel-note">{money(data?.resultCount)} ta natija</span>
          </div>
          <div className="ol-filter-row">
            <div className="ol-search"><Search size={18}/><input value={draftSearch}
              onChange={e=>setDraftSearch(e.target.value)} placeholder="Ism, username yoki Telegram ID bo‘yicha qidirish"
              aria-label="Foydalanuvchilarni qidirish" /></div>
            <div className="ol-filter-tabs">{[['all','Barchasi'],['online','Online'],['offline','Offline']].map(([id,label])=>
              <button className={status===id?'active':''} type="button" onClick={()=>{setStatus(id);setPage(1)}} key={id}>{label}</button>)}</div>
          </div>
          <div className="ol-table-wrap">
            <table className="ol-table"><thead><tr><th>FOYDALANUVCHI</th><th>HOLAT</th><th>JOYLASHUV</th><th>BALANS</th><th>RO‘YXATDAN O‘TGAN</th><th/></tr></thead>
              <tbody>{(data?.users||[]).map(user=><tr key={user.id} onClick={()=>openUser(user.id)} tabIndex={0}
                onKeyDown={e=>{if(e.key==='Enter')openUser(user.id)}}>
                <td><div className="ol-row-user"><Initials name={user.first_name||user.username}/>
                  <div><strong>{user.first_name||user.username||'Telegram user'}</strong>
                  <small>{user.username?'@'+user.username:'ID: '+user.id}</small></div></div></td>
                <td><span className={'ol-state '+(user.online?'online':'offline')}>{user.online?'● Online':'○ Offline'}</span></td>
                <td><span className="ol-table-section">{user.online?sectionName(user.section):delayAgo(user.last_seen_at)}</span></td>
                <td><strong className="ol-row-balance">{money(user.balance)} ★</strong></td>
                <td><span className="ol-row-date">{time(user.created_at)}</span></td>
                <td><ChevronRight size={17}/></td>
              </tr>)}
              {!busy && !data?.users?.length?<tr><td colSpan={6} className="ol-empty">Bu filtr bo‘yicha foydalanuvchi topilmadi.</td></tr>:null}
              </tbody></table>
          </div>
          {busy&&!data?<div className="ol-loading"><span className="ol-spin"/> Ma’lumotlar yuklanmoqda…</div>:null}
          <div className="ol-pagination"><span>{money(data?.resultCount)} natija · {page}/{pages} sahifa</span>
            <div><button disabled={page<=1} onClick={()=>setPage(n=>n-1)}><ArrowLeft size={16}/> Oldingi</button>
              <button disabled={page>=pages} onClick={()=>setPage(n=>n+1)}>Keyingi <ArrowRight size={16}/></button></div></div>
        </section>
        <footer className="ol-footer"><span><ShieldCheck size={15}/> Faqat admin · Barcha so‘rovlar serverda autentifikatsiya qilinadi</span>
          <span>Online — 65 s faol sessiya. Xatoliklar — faqat qayd qilingan client xatolari.</span></footer>
      </div>
      {selected?<UserDetail detail={detail} loading={detailBusy} onClose={closeUser} onRefresh={()=>openUser(selected)}/>:null}
    </>}
  </main>;
}
