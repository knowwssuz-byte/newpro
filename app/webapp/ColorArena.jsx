'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Plus,Users,Shield,Timer,RefreshCw,Eye,Coins,Crown} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import {ARENA_COLORS,orderedShares,renderPolygon,labelPoint,orientPoint} from '@/lib/colorArenaGeometry.mjs';
import styles from './ColorArena.module.css';

const KEY='myst:color-arena-room';
const TISH='✦';
const fmt=n=>Number(n||0).toLocaleString('en-US');
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
function makeId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  return [...bytes].map((b,i)=>[4,6,8,10].includes(i)?'-'+b.toString(16).padStart(2,'0'):b.toString(16).padStart(2,'0')).join('');
}
function waveReflect(x){
  const n=((x%2)+2)%2;
  return n<=1?n:2-n;
}
function ballPosition(target,t,seed){
  const [tx,ty]=orientPoint(target.x,target.y,seed);
  if(t>=1)return [tx,ty];
  const p=ease(t),sway=Math.sin(Math.PI*t)*Math.pow(1-t,.26);
  return [
    waveReflect(.5+(tx-.5)*p + Math.sin(t*42+0.2)*.78*sway),
    waveReflect(.5+(ty-.5)*p + Math.sin(t*36+1.5)*.72*sway),
  ];
}
function ArenaCanvas({room,clockOffset}) {
  const canvas=useRef(null),orb=useRef(null),state=useRef(null);
  const players=room?.players||[];
  const seed=Number(room?.seed||0);
  const shares=orderedShares(players);
  const key=players.map(p=>p.seat+':'+p.stake).join('|')+'-'+room?.roundId;
  // Reconciled area transitions: interpolate shares, not independently moved paths.
  // This preserves a gap-free partition *at every animation frame*.
  if(!state.current||state.current.roundId!==room?.roundId){
    state.current={roundId:room?.roundId,from:shares.map(p=>p.share),to:shares.map(p=>p.share),start:0,key,seed};
  } else if(state.current.key!==key){
    const old=state.current;
    const previous=new Map((old.players||[]).map((p,i)=>[p.seat,p.share]));
    const from=shares.map(p=>previous.get(p.seat)??0);
    const total=from.reduce((a,b)=>a+b,0);
    state.current={roundId:room.roundId,from:total?from.map(v=>v/total):shares.map(p=>p.share),
      to:shares.map(p=>p.share),start:performance.now(),key,seed};
  }
  state.current.players=shares;
  useEffect(()=>{
    if(!canvas.current)return;
    let alive=true,frame=0,ctx=canvas.current.getContext('2d');
    const render=now=>{
      if(!alive)return;
      const el=canvas.current;
      if(!el)return;
      const width=el.clientWidth||320,dpr=Math.min(window.devicePixelRatio||1,2);
      if(el.width!==Math.round(width*dpr)){el.width=Math.round(width*dpr);el.height=Math.round(width*dpr);}
      ctx.setTransform(dpr,0,0,dpr,0,0);
      const n=width;ctx.clearRect(0,0,n,n);
      ctx.fillStyle='#0e1128';ctx.fillRect(0,0,n,n);
      // Fine grid behind the fluid shapes.
      ctx.strokeStyle='rgba(190,205,255,.055)';ctx.lineWidth=.5;
      for(let i=0;i<=12;i++){let p=i*n/12;ctx.beginPath();ctx.moveTo(p,0);ctx.lineTo(p,n);ctx.moveTo(0,p);ctx.lineTo(n,p);ctx.stroke();}
      if(room?.players?.length){
        const data=state.current;
        const t=data.start?ease((now-data.start)/670):1;
        const vals=shares.map((v,i)=>({...v,share:data.from[i]*(1-t)+data.to[i]*t}));
        vals.forEach((entry,i)=>{
          const polygon=renderPolygon(vals,seed,i);
          if(polygon.length===0)return;
          ctx.beginPath();polygon.forEach(([x,y],j)=>j?ctx.lineTo(x*n,y*n):ctx.moveTo(x*n,y*n));ctx.closePath();
          const color=ARENA_COLORS[entry.seat%ARENA_COLORS.length];
          ctx.save();
          ctx.fillStyle=color;
          ctx.globalAlpha=room.status==='RESULT'&&String(room.winnerId)!==String(entry.id)?0.23:0.74;
          ctx.fill();
          ctx.globalAlpha=1;
          const glow=ctx.createLinearGradient(0,0,n,n);glow.addColorStop(0,'rgba(255,255,255,.22)');glow.addColorStop(.4,'rgba(255,255,255,0)');glow.addColorStop(1,'rgba(0,0,20,.35)');
          ctx.fillStyle=glow;ctx.fill();
          ctx.shadowBlur=room.status==='RESULT'&&String(room.winnerId)===String(entry.id)?30:12;
          ctx.shadowColor=color;ctx.lineWidth=2.3;ctx.strokeStyle=color;ctx.stroke();
          ctx.shadowBlur=0;ctx.lineWidth=.5;ctx.strokeStyle='rgba(255,255,255,.36)';ctx.stroke();
          if(room.status==='RESULT'&&String(room.winnerId)===String(entry.id)){
            ctx.globalAlpha=.12+.12*Math.sin(now/270);ctx.fillStyle='#ffffff';ctx.fill();ctx.globalAlpha=1;
          }
          ctx.restore();
        });
      }
      if(orb.current){
        const active=['LOCKED','ROLLING','RESULT'].includes(room?.status);
        orb.current.style.display=active?'block':'none';
        if(active){
          const t=room.status==='RESULT'?1:room.status==='LOCKED'?0:clamp(
            (Date.now()+clockOffset-Date.parse(room.rollingAt))/
            Math.max(1,Date.parse(room.rollEndsAt)-Date.parse(room.rollingAt)),0,1);
          const [x,y]=room.target?ballPosition(room.target,t,seed):[.5,.5];
          orb.current.style.left=(x*100)+'%';
          orb.current.style.top=(y*100)+'%';
          orb.current.style.transform='translate(-50%,-50%) scale('+(room.status==='RESULT'?1.22:1)+')';
        }
      }
      frame=requestAnimationFrame(render);
    };
    frame=requestAnimationFrame(render);
    return()=>{alive=false;cancelAnimationFrame(frame);};
  },[room,key,seed,clockOffset]);
  return <div className={styles.boardShell}>
    <div className={styles.board} aria-label="Stavkalarga mos, egri chegarali rangli maydon">
      <canvas ref={canvas} className={styles.canvas}/>
      {shares.map((entry,i)=>{
        const [x,y]=labelPoint(shares,seed,i);
        return <div key={entry.seat} className={styles.areaTag}
          style={{left:(x*100)+'%',top:(y*100)+'%',borderColor:ARENA_COLORS[entry.seat%8],
            display:entry.share<.065?'none':undefined}}>
          <span className={styles.areaAvatar}>{(entry.name||'P')[0]}</span>
          <strong>{entry.name}</strong>
          <small>{(entry.share*100).toFixed(1)}%</small>
        </div>;
      })}
      <span ref={orb} className={styles.orb} aria-hidden="true"/>
      {room?.status==='RESULT' ? <div className={styles.victory}>
        <div className={styles.victoryParticles} aria-hidden="true">
          {Array.from({length:26},(_,i)=><i key={i} style={{'--i':i,'--dx':(i*37)%105-52,'--dy':(i*53)%100-65,'--delay':i%6}}/>)}
        </div>
        <Crown size={28}/><span>G‘OLIB</span><strong>{room.winnerName||'Player'}</strong>
        <b>+{fmt(room.pot)} {TISH}</b>
      </div>:null}
    </div>
    <div className={styles.boardFooter}><span><i/> FAIR AREA SYSTEM</span><span>100% TAQSIMLANGAN</span></div>
  </div>;
}
export default function ColorArena({onBack,apiPost,onToast}) {
  const [rooms,setRooms]=useState([]),[room,setRoom]=useState(null),[tish,setTish]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [create,setCreate]=useState(false),[min,setMin]=useState(10),[max,setMax]=useState(6);
  const [stake,setStake]=useState(10),[raise,setRaise]=useState(10),[clock,setClock]=useState(Date.now());
  const [offset,setOffset]=useState(0);
  const refreshBusy=useRef(false),pending=useRef(new Map());
  const update=useCallback(data=>{
    if(data.balance!=null)setTish(Number(data.balance));
    if(data.serverNow)setOffset(Number(data.serverNow)-Date.now());
    if(data.room){
      setRoom(data.room);
      try{localStorage.setItem(KEY,data.room.id)}catch{}
    }
  },[]);
  const call=useCallback((action,payload={})=>apiPost('/api/color-arena',{action,...payload},{timeoutMs:12000}),[apiPost]);
  const refresh=useCallback(async(id,quiet=true)=>{
    if(refreshBusy.current)return;
    refreshBusy.current=true;
    try{
      const data=await call(id?'state':'list',id?{roomId:id}:{});
      if(id){update(data);}
      else{
        setRooms(data.rooms||[]);
        if(data.balance!=null)setTish(Number(data.balance));
        if(data.serverNow)setOffset(Number(data.serverNow)-Date.now());
      }
      if(!quiet)setError('');
      return data;
    }catch(e){if(!quiet)setError(e?.message||'Ulanib bo‘lmadi');return null;}
    finally{refreshBusy.current=false;setLoading(false);}
  },[call,update]);
  useEffect(()=>{
    let stopped=false;
    (async()=>{
      let saved=null;try{saved=localStorage.getItem(KEY)}catch{}
      if(saved){
        const data=await refresh(saved,false);
        if(data?.room&&!['CANCELLED'].includes(data.room.status))return;
        try{localStorage.removeItem(KEY)}catch{}
      }
      if(!stopped)await refresh(null,false);
    })();
    return()=>{stopped=true;};
  },[refresh]);
  useEffect(()=>{
    const t=setInterval(()=>setClock(Date.now()),250);
    return()=>clearInterval(t);
  },[]);
  useEffect(()=>{
    const timer=setInterval(()=>void refresh(room?.id||null,true),room?.id?1400:4000);
    return()=>clearInterval(timer);
  },[room?.id,refresh]);
  // Realtime notifies clients over WebSockets; authoritative state is always re-fetched.
  // Polling also reconciles reconnects and instances with no configured public anon key.
  useEffect(()=>{
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)return;
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const channel=client.channel('arena-events-'+(room?.id||'lobby'))
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'color_arena_events'},payload=>{
        if(room?.id&&payload.new?.room_id!==room.id)return;
        void refresh(room?.id||null,true);
      }).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[room?.id,refresh]);
  async function act(action,payload={},nonceKey=null){
    if(busy)return;
    setBusy(action);setError('');
    try{
      let requestId;
      if(['create','join','raise'].includes(action)){
        const key=nonceKey||action+':'+(payload.roomId||'new')+':'+JSON.stringify(payload);
        requestId=pending.current.get(key)||makeId();
        pending.current.set(key,requestId);
        payload={...payload,requestId};
      }
      const result=await call(action,payload);
      if(result.cancelled){
        setRoom(null);try{localStorage.removeItem(KEY)}catch{}
        await refresh(null,true);
      }else update(result);
      if(nonceKey||requestId){
        const key=nonceKey||action+':'+(payload.roomId||'new')+':'+JSON.stringify(Object.fromEntries(Object.entries(payload).filter(([k])=>k!=='requestId')));
        pending.current.delete(key);
      }
      setCreate(false);
      onToast?.(action==='raise'?'Hududingiz kengaytirildi':action==='create'?'Arena yaratildi':'Arena yangilandi');
    }catch(e){
      setError(e?.message||'Amal bajarilmadi');
      // Keep nonce for retry after uncertain network failure.
      if(payload.roomId)void refresh(payload.roomId,true);
    }finally{setBusy('');}
  }
  const returnLobby=()=>{setRoom(null);try{localStorage.removeItem(KEY)}catch{}void refresh(null,true)};
  const seconds=end=>end?Math.max(0,Math.ceil((Date.parse(end)-(clock+offset))/1000)):null;
  const myBet=room?.players?.find(p=>p.isMe);
  const canBet=room&&['WAITING','BETTING'].includes(room.status)
    &&(room.status==='WAITING'||seconds(room.bettingEndsAt)>0);
  const canJoin=canBet&&!myBet&&room.players.length<room.maxPlayers;
  const status={
    WAITING:'O‘YINCHILAR KUTILMOQDA',BETTING:'STAVKALAR OCHIQ',
    LOCKED:'MAYDON TASDIQLANDI',ROLLING:'SHAR HARAKATDA',
    RESULT:'RAUND YAKUNLANDI',CANCELLED:'XONA YOPILDI'
  }[room?.status];
  return <section className={styles.root}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={room?returnLobby:onBack}><ArrowLeft size={19}/></button>
      <div><small>PVP / MYST ARENA</small><h2>COLOR <em>ARENA</em></h2></div>
      <span className={styles.live}><i/> LIVE</span>
    </header>
    <div className={styles.wallet}><div><Coins size={20}/><span>VIRTUAL TISH <small>Pulga almashtirilmaydi</small></span></div>
      <strong>{tish===null?'…':fmt(tish)} <b>{TISH}</b></strong></div>
    {loading&&!room?<div className={styles.notice}>Arenalar yuklanmoqda…</div>:null}
    {!room?<div className={styles.lobby}>
      <div className={styles.sectionHeading}><div><small>MULTIPLAYER</small><h3>Faol xonalar</h3></div>
        <button className={styles.softButton} onClick={()=>setCreate(v=>!v)} type="button"><Plus size={15}/> Xona yaratish</button></div>
      {create?<div className={styles.creator}>
        <label>Minimal stavka <input type="number" min="5" max="500" step="1" value={min} onChange={e=>setMin(e.target.value)}/></label>
        <label>O‘yinchilar soni <select value={max} onChange={e=>setMax(Number(e.target.value))}>{[2,3,4,5,6,7,8].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
        <label>Birinchi stavkangiz <input type="number" min={min||5} max="200000" step="1" value={stake} onChange={e=>setStake(e.target.value)}/></label>
        <button disabled={!!busy||Number(stake)>Number(tish)||Number(stake)<Number(min)}
          className={styles.primary} onClick={()=>act('create',{minStake:Number(min),maxPlayers:Number(max),stake:Number(stake)})} type="button">
          <Plus size={16}/> {busy?'Yaratilmoqda…':'Arena yaratish'}</button>
      </div>:null}
      <div className={styles.roomList}>
        {rooms.length?rooms.map(r=><button key={r.id} className={styles.roomCard} type="button" onClick={async()=>{
          const data=await refresh(r.id,false);if(!data?.room)return;
        }}>
          <span className={styles.roomSymbol}><i/><i/><i/><i/></span>
          <span className={styles.roomInfo}><strong>{r.name} arenasi</strong>
            <small><Users size={12}/> {r.players}/{r.maxPlayers} <b>·</b> Min {fmt(r.minStake)} {TISH}</small></span>
          <span className={styles.roomMeta}><strong>{fmt(r.pot)} {TISH}</strong>
            <small>{r.status==='BETTING'?'JOIN NOW':'WAITING'}</small></span>
          <ArrowRight size={16}/></button>)
          :!loading?<div className={styles.empty}><Users size={26}/><strong>Hozircha ochiq xona yo‘q</strong>
            <span>Birinchi arenani yarating va o‘yinchilarni kuting.</span></div>:null}
      </div>
      <div className={styles.disclaimer}><Shield size={16}/> Faqat bepul virtual TISH. Real pul, Stars va TON ishlatilmaydi.</div>
    </div>:<div className={styles.inRoom}>
      <div className={styles.roundTop}>
        <span className={styles.status}><i/>{status}</span>
        <span className={styles.round}>ROUND #{room.roundNo}</span>
      </div>
      <div className={styles.stats}>
        <div><small>UMUMIY FOND</small><strong>{fmt(room.pot)} <b>{TISH}</b></strong></div>
        <div><small>O‘YINCHILAR</small><strong>{room.players.length}<b>/{room.maxPlayers}</b></strong></div>
        <div><small>{room.status==='BETTING'?'STAVKA VAQTI':'BOSQICH'}</small>
          <strong><Timer size={17}/>{room.status==='BETTING'?seconds(room.bettingEndsAt)+'s':
            room.status==='ROLLING'?seconds(room.rollEndsAt)+'s':room.status==='RESULT'?'FINISH':'●'}</strong></div>
      </div>
      <ArenaCanvas room={room} clockOffset={offset}/>
      <div className={styles.playersTitle}><strong>O‘yinchilar</strong><span>{room.players.length} ta hudud</span></div>
      <div className={styles.players}>
        {room.players.map(p=><div className={styles.player} key={p.seat}>
          <span className={styles.playerAvatar} style={{borderColor:ARENA_COLORS[p.seat%8],color:ARENA_COLORS[p.seat%8]}}>{p.name[0]}</span>
          <span className={styles.playerName}>{p.name}{p.isMe?<small>SIZ</small>:null}</span>
          <strong>{fmt(p.stake)} {TISH}</strong>
          <b style={{color:ARENA_COLORS[p.seat%8]}}>{p.percentage.toFixed(1)}%</b>
        </div>)}
      </div>
      {canJoin?<div className={styles.betPanel}>
        <div className={styles.panelHead}><strong>Hududni egallang</strong><span>Min {room.minStake} {TISH}</span></div>
        <div className={styles.quick}>{[room.minStake,25,50,100].filter((v,i,a)=>a.indexOf(v)===i).map(n=>
          <button type="button" key={n} onClick={()=>setStake(n)}>{n}</button>)}</div>
        <div className={styles.betRow}><input aria-label="Stavka" type="number" value={stake}
          min={room.minStake} max={200000} onChange={e=>setStake(e.target.value)}/>
          <button className={styles.primary} disabled={!!busy||Number(stake)<room.minStake||Number(stake)>Number(tish)}
            onClick={()=>act('join',{roomId:room.id,stake:Number(stake)})} type="button">
            <Plus size={16}/> Qo‘shilish</button></div>
      </div>:null}
      {myBet&&canBet?<div className={styles.betPanel}>
        <div className={styles.panelHead}><strong>Hududingizni kengaytiring</strong><span>Stavka: {fmt(myBet.stake)} {TISH}</span></div>
        <div className={styles.quick}>{[5,10,25,50,100].map(n=><button type="button" onClick={()=>setRaise(n)} key={n}>{n}</button>)}</div>
        <div className={styles.betRow}><input type="number" min="1" max="200000" value={raise}
          aria-label="Qo‘shimcha stavka" onChange={e=>setRaise(e.target.value)}/>
          <button className={styles.primary} disabled={!!busy||Number(raise)<1||Number(raise)>Number(tish)}
            onClick={()=>act('raise',{roomId:room.id,amount:Number(raise)})} type="button">
            <Plus size={16}/> Oshirish</button></div>
      </div>:null}
      {room.status==='WAITING'&&!myBet?<p className={styles.notice}>Keyingi raundni boshlash uchun stavka qo‘ying.</p>:null}
      {room.status==='WAITING'&&myBet?<p className={styles.notice}>Ikkinchi o‘yinchi qo‘shilganda 30 soniyalik stavka vaqti boshlanadi.</p>:null}
      {room.status==='WAITING'&&myBet?.seat===0?
        <button type="button" className={styles.cancel} disabled={!!busy}
          onClick={()=>act('cancel',{roomId:room.id})}>Bo‘sh xonani bekor qilish va TISH qaytarish</button>:null}
      <div className={styles.history}><h4><Eye size={15}/> So‘nggi g‘oliblar</h4>
        {room.history.length?room.history.map(h=><div key={h.round_id}><span>#{h.round_no}</span>
          <strong>Player {String(h.winner_id).slice(-4)}</strong><b>+{fmt(h.pot)} {TISH}</b></div>)
          :<small>Hozircha raund tarixi yo‘q.</small>}</div>
    </div>}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    {room?.status==='CANCELLED'?<button className={styles.primary} onClick={returnLobby} type="button">Xonalarga qaytish</button>:null}
  </section>;
}
