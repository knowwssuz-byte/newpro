'use client';

import {useCallback,useEffect,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,Plus,Users,Shield,Timer,RefreshCw,Eye,Coins,Crown} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import {orderedShares,renderBands,labelPoint,orientPoint,boundaryAt,arenaColorForSeat} from '@/lib/colorArenaGeometry.mjs';
import {createBilliardPath,projectHitToRegion,billiardVelocity} from '@/lib/colorArenaBallPhysics.mjs';
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
function ArenaCanvas({room,clockOffset}) {
  const canvas=useRef(null),orb=useRef(null),state=useRef(null);
  const players=room?.players||[];
  const seed=Number(room?.seed||0);
  const shares=orderedShares(players);
  const finalPoint=room?.target?projectHitToRegion(room.target,shares,seed,boundaryAt):null;
  const visualPoint=finalPoint?orientPoint(finalPoint.x,finalPoint.y,seed):null;
  const trajectory=visualPoint?createBilliardPath({x:visualPoint[0],y:visualPoint[1]},seed,room.roundNo):null;
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
    if(!ctx)return;
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
        const polygons=renderBands(vals,seed,vals.length>300?14:vals.length>80?24:48);
        vals.forEach((entry,i)=>{
          const polygon=polygons[i];
          if(polygon.length===0)return;
          ctx.beginPath();polygon.forEach(([x,y],j)=>j?ctx.lineTo(x*n,y*n):ctx.moveTo(x*n,y*n));ctx.closePath();
          const color=arenaColorForSeat(entry.seat);
          ctx.save();
          ctx.fillStyle=color;
          ctx.globalAlpha=room.status==='RESULT'&&String(room.winnerId)!==String(entry.id)?0.23:0.74;
          ctx.fill();
          ctx.globalAlpha=1;
          if(vals.length<80){
            const glow=ctx.createLinearGradient(0,0,n,n);glow.addColorStop(0,'rgba(255,255,255,.22)');
            glow.addColorStop(.4,'rgba(255,255,255,0)');glow.addColorStop(1,'rgba(0,0,20,.35)');
            ctx.fillStyle=glow;ctx.fill();
          }
          ctx.shadowBlur=vals.length>80?0:room.status==='RESULT'&&String(room.winnerId)===String(entry.id)?30:12;
          ctx.shadowColor=color;ctx.lineWidth=2.3;ctx.strokeStyle=color;ctx.stroke();
          ctx.shadowBlur=0;ctx.lineWidth=.5;ctx.strokeStyle='rgba(255,255,255,.36)';ctx.stroke();
          if(room.status==='RESULT'&&String(room.winnerId)===String(entry.id)){
            ctx.globalAlpha=.12+.12*Math.sin(now/270);ctx.fillStyle='#ffffff';ctx.fill();ctx.globalAlpha=1;
          }
          ctx.restore();
        });
      }
      const active=['LOCKED','ROLLING','RESULT'].includes(room?.status);
      const t=room?.status==='RESULT'?1:room?.status==='LOCKED'?0:clamp(
        (Date.now()+clockOffset-Date.parse(room?.rollingAt))/
        Math.max(1,Date.parse(room?.rollEndsAt)-Date.parse(room?.rollingAt)),0,1);
      const point=trajectory?trajectory.position(t):[.5,.5];
      if(trajectory && room?.status==='ROLLING'){
        // Specular wall impacts, reflective sparks, motion blur and a soft shadow.
        const intensity=1-t;
        ctx.save();
        for(let i=11;i>0;i--){
          const pp=trajectory.position(Math.max(0,t-i*.0028));
          const alpha=(12-i)/12*.16*intensity;
          ctx.beginPath();ctx.arc(pp[0]*n,pp[1]*n,(4+(12-i)*.45)*Math.min(1,n/360),0,Math.PI*2);
          ctx.fillStyle='rgba(196,223,255,'+alpha+')';ctx.fill();
        }
        for(const impact of trajectory.impacts){
          const age=t-impact.t;
          if(age<0||age>.047)continue;
          const fade=1-age/.047;
          const x=impact.x*n,y=impact.y*n;
          const halo=ctx.createRadialGradient(x,y,0,x,y,27*fade+5);
          halo.addColorStop(0,'rgba(255,247,222,'+(.7*fade)+')');
          halo.addColorStop(1,'rgba(184,213,255,0)');
          ctx.fillStyle=halo;ctx.beginPath();ctx.arc(x,y,27*fade+5,0,Math.PI*2);ctx.fill();
          ctx.lineWidth=1.4;ctx.strokeStyle='rgba(229,237,255,'+(.8*fade)+')';
          for(let j=0;j<6;j++){
            const angle=j*Math.PI/3+impact.t*20;
            ctx.beginPath();ctx.moveTo(x+Math.cos(angle)*5,y+Math.sin(angle)*5);
            ctx.lineTo(x+Math.cos(angle)*(7+22*(1-fade)),y+Math.sin(angle)*(7+22*(1-fade)));ctx.stroke();
          }
        }
        ctx.restore();
      }
      if(orb.current){
        orb.current.style.display=active?'block':'none';
        if(active){
          orb.current.style.left=(point[0]*100)+'%';
          orb.current.style.top=(point[1]*100)+'%';
          const velocity=trajectory?billiardVelocity(trajectory,t):[0,0];
          const speed=Math.hypot(...velocity);
          orb.current.style.setProperty('--ball-rotation',((t*960+Math.atan2(velocity[1],velocity[0])*180/Math.PI)||0)+'deg');
          orb.current.style.setProperty('--ball-brightness',(1+Math.min(.25,speed*.015)).toFixed(3));
          orb.current.style.transform='translate(-50%,-50%) scale('+(room.status==='RESULT'?1.14:1)+')';
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
          style={{left:(x*100)+'%',top:(y*100)+'%',borderColor:arenaColorForSeat(entry.seat),
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
  const [room,setRoom]=useState(null),[tish,setTish]=useState(null);
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [stake,setStake]=useState(10),[raise,setRaise]=useState(10);
  const [clock,setClock]=useState(Date.now()),[offset,setOffset]=useState(0);
  const syncBusy=useRef(false),pending=useRef(new Map());
  const call=useCallback((action,payload={})=>
    apiPost('/api/color-arena',{action,...payload},{timeoutMs:14000}),[apiPost]);
  const apply=useCallback(data=>{
    if(data?.balance!=null)setTish(Number(data.balance));
    if(data?.serverNow)setOffset(Number(data.serverNow)-Date.now());
    if(data?.room)setRoom(previous=>{
      if(previous?.id===data.room.id && previous.roundId===data.room.roundId &&
         Number(previous.version)>Number(data.room.version))return previous;
      return data.room;
    });
  },[]);
  const refresh=useCallback(async(quiet=true)=>{
    if(syncBusy.current)return null;
    syncBusy.current=true;
    try{
      const data=await call('state');
      apply(data);
      if(!quiet)setError('');
      return data;
    }catch(e){if(!quiet)setError(e?.message||'Arena bilan ulanishda xatolik');return null;}
    finally{syncBusy.current=false;setLoading(false);}
  },[call,apply]);
  useEffect(()=>{void refresh(false);},[refresh]);
  useEffect(()=>{
    const timer=setInterval(()=>setClock(Date.now()),250);
    const polling=setInterval(()=>void refresh(true),1800);
    const focus=()=>void refresh(true);
    window.addEventListener('focus',focus);
    window.addEventListener('online',focus);
    return()=>{
      clearInterval(timer);clearInterval(polling);
      window.removeEventListener('focus',focus);window.removeEventListener('online',focus);
    };
  },[refresh]);
  useEffect(()=>{
    if(!room?.id)return;
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key)return;
    const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const channel=client.channel('color-arena-public-'+room.id)
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'color_arena_events',
        filter:'room_id=eq.'+room.id},()=>{void refresh(true);}).subscribe();
    return()=>{void client.removeChannel(channel);};
  },[room?.id,refresh]);
  async function act(action,payload={}){
    if(busy)return;
    setBusy(action);setError('');
    const nonceKey=action+':'+JSON.stringify(payload);
    try{
      if(action==='join'||action==='raise'){
        const requestId=pending.current.get(nonceKey)||makeId();
        pending.current.set(nonceKey,requestId);
        payload={...payload,requestId};
      }
      const result=await call(action,payload);
      apply(result);
      pending.current.delete(nonceKey);
      onToast?.(action==='raise'?'Hududingiz kengaydi':
        action==='join'?'Ommaviy arenaga qo‘shildingiz':'Stavka qaytarildi');
    }catch(e){
      setError(e?.message||'So‘rov bajarilmadi. Qayta urinib ko‘ring.');
      // The same request ID is retained so retry cannot double-debit.
      void refresh(true);
    }finally{setBusy('');}
  }
  const seconds=end=>end?Math.max(0,Math.ceil((Date.parse(end)-clock-offset)/1000)):null;
  const myBet=room?.players?.find(p=>p.isMe);
  const canBet=room&&['WAITING','BETTING'].includes(room.status)
    &&(room.status==='WAITING'||seconds(room.bettingEndsAt)>0);
  const status={
    WAITING:'O‘YINCHILAR KUTILMOQDA',BETTING:'STAVKALAR OCHIQ',
    LOCKED:'MAYDON TASDIQLANDI',ROLLING:'SHAR HARAKATDA',
    RESULT:'RAUND YAKUNLANDI',CANCELLED:'ARENA YOPILDI'
  }[room?.status];
  const leaders=room?.players
    ?[...room.players].sort((a,b)=>b.stake-a.stake).slice(0,12):[];
  if(myBet&&!leaders.some(p=>p.id===myBet.id))leaders.push(myBet);
  return <section className={styles.root}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="PvP bo‘limiga qaytish">
        <ArrowLeft size={19}/></button>
      <div><small>PVP / OMMAVIY MAYDON</small><h2>COLOR <em>ARENA</em></h2></div>
      <span className={styles.live}><i/> LIVE</span>
    </header>
    <div className={styles.wallet}>
      <div><Coins size={20}/><span>VIRTUAL TISH <small>Pulga almashtirilmaydi</small></span></div>
      <strong>{tish===null?'…':fmt(tish)} <b>{TISH}</b></strong>
    </div>
    {loading&&!room?<div className={styles.notice}>Ommaviy arena yuklanmoqda…</div>:null}
    {room?<div className={styles.inRoom}>
      <div className={styles.roundTop}>
        <span className={styles.status}><i/>{status}</span>
        <span className={styles.round}>ROUND #{room.roundNo}</span>
      </div>
      <div className={styles.stats}>
        <div><small>UMUMIY FOND</small><strong>{fmt(room.pot)} <b>{TISH}</b></strong></div>
        <div><small>O‘YINCHILAR</small><strong><Users size={15}/>{fmt(room.players.length)} <b>∞</b></strong></div>
        <div><small>{room.status==='BETTING'?'STAVKA VAQTI':'BOSQICH'}</small>
          <strong><Timer size={15}/>{room.status==='BETTING'?seconds(room.bettingEndsAt)+'s':
            room.status==='ROLLING'?seconds(room.rollEndsAt)+'s':
            room.status==='RESULT'?'FINISH':room.status==='LOCKED'?'READY':'●'}</strong></div>
      </div>
      <ArenaCanvas room={room} clockOffset={offset}/>
      <div className={styles.playersTitle}>
        <strong>O‘yinchilar</strong><span>{fmt(room.players.length)} ta hudud · TOP 12</span>
      </div>
      <div className={styles.players}>
        {leaders.length?leaders.map(p=><div className={styles.player} key={p.seat}>
          <span className={styles.playerAvatar} style={{
            borderColor:arenaColorForSeat(p.seat),color:arenaColorForSeat(p.seat)
          }}>{(p.name||'P')[0]}</span>
          <span className={styles.playerName}>{p.name}{p.isMe?<small>SIZ</small>:null}</span>
          <strong>{fmt(p.stake)} {TISH}</strong>
          <b style={{color:arenaColorForSeat(p.seat)}}>{p.percentage.toFixed(2)}%</b>
        </div>):<p className={styles.notice}>Birinchi stavkani qo‘ying, hududingiz paydo bo‘ladi.</p>}
      </div>
      {canBet&&!myBet?<div className={styles.betPanel}>
        <div className={styles.panelHead}>
          <strong>Ommaviy arenaga qo‘shilish</strong><span>Min {room.minStake} {TISH}</span>
        </div>
        <div className={styles.quick}>
          {[room.minStake,25,50,100].filter((v,i,a)=>a.indexOf(v)===i).map(n=>
            <button type="button" key={n} onClick={()=>setStake(n)}>{n}</button>)}
        </div>
        <div className={styles.betRow}>
          <input aria-label="Stavka miqdori" type="number" min={room.minStake} max="200000"
            value={stake} onChange={e=>setStake(e.target.value)}/>
          <button type="button" className={styles.primary}
            disabled={!!busy||Number(stake)<room.minStake||Number(stake)>Number(tish)}
            onClick={()=>act('join',{stake:Number(stake)})}>
            <Plus size={16}/> Qo‘shilish
          </button>
        </div>
      </div>:null}
      {canBet&&myBet?<div className={styles.betPanel}>
        <div className={styles.panelHead}><strong>Hududingizni kengaytiring</strong>
          <span>{fmt(myBet.stake)} {TISH} tikilgan</span></div>
        <div className={styles.quick}>
          {[5,10,25,50,100].map(n=><button type="button" key={n} onClick={()=>setRaise(n)}>{n}</button>)}
        </div>
        <div className={styles.betRow}>
          <input type="number" min="1" max="200000" aria-label="Qo‘shimcha stavka"
            value={raise} onChange={e=>setRaise(e.target.value)}/>
          <button type="button" className={styles.primary}
            disabled={!!busy||Number(raise)<1||Number(raise)>Number(tish)}
            onClick={()=>act('raise',{amount:Number(raise)})}>
            <Plus size={16}/> Oshirish</button>
        </div>
      </div>:null}
      {room.status==='WAITING'?<p className={styles.notice}>
        Kamida 2 o‘yinchi stavka qo‘ygach 30 soniyalik raund avtomatik boshlanadi.
      </p>:null}
      {room.status==='WAITING'&&myBet&&room.players.length===1?
        <button type="button" className={styles.cancel} disabled={!!busy}
          onClick={()=>act('leave')}>O‘yin boshlanmasidan stavkani qaytarish</button>:null}
      {['LOCKED','ROLLING','RESULT'].includes(room.status)?<p className={styles.notice}>
        Stavkalar yopilgan. Keyingi raund avtomatik ochiladi; arena doim shu yerda.
      </p>:null}
      <div className={styles.history}><h4><Eye size={15}/> So‘nggi g‘oliblar</h4>
        {room.history.length?room.history.map(h=><div key={h.round_id}>
          <span>#{h.round_no}</span>
          <strong>Player {String(h.winner_id).slice(-4)}</strong>
          <b>+{fmt(h.pot)} {TISH}</b>
        </div>):<small>Hozircha g‘oliblar tarixi yo‘q.</small>}
      </div>
    </div>:null}
    {!room&&!loading?<button type="button" className={styles.primary} onClick={()=>void refresh(false)}>
      <RefreshCw size={16}/> Arenaga qayta ulanish</button>:null}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
    <div className={styles.disclaimer}><Shield size={16}/>
      Bitta umumiy arena. O‘yinchilar soniga belgilangan limit yo‘q.
      TISH — faqat o‘yin ichidagi bepul virtual kredit.
    </div>
  </section>;
}
