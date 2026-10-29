'use client';

import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,Plus,Users,Timer,RefreshCw,Eye,Crown,Volume2,VolumeX} from 'lucide-react';
import {createClient} from '@supabase/supabase-js';
import {orderedShares,renderBands,labelPoint,orientPoint,boundaryAt,arenaColorForSeat} from '@/lib/colorArenaGeometry.mjs';
import {createBilliardPath,projectHitToRegion,billiardVelocity,ringRotation} from '@/lib/colorArenaBallPhysics.mjs';
import {createArenaAudio} from '@/lib/colorArenaAudio.mjs';
import styles from './ColorArena.module.css';

const STARS='★';
const fmt=n=>Number(n||0).toLocaleString('en-US');
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const ease=t=>1-Math.pow(1-clamp(t,0,1),3);
function makeId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const bytes=new Uint8Array(16);globalThis.crypto.getRandomValues(bytes);
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  return [...bytes].map((b,i)=>[4,6,8,10].includes(i)?'-'+b.toString(16).padStart(2,'0'):b.toString(16).padStart(2,'0')).join('');
}
function ArenaCanvas({room,clockOffset,audioController}) {
  const canvas=useRef(null),orb=useRef(null),state=useRef(null);
  const players=room?.players||[];
  const seed=Number(room?.seed||0);
  const key=players.map(p=>p.seat+':'+p.stake).join('|')+'-'+room?.roundId;
  const shares=useMemo(()=>orderedShares(players),[key]);
  const trajectory=useMemo(()=>{
    if(!room?.target || shares.length<2)return null;
    const finalPoint=projectHitToRegion(room.target,shares,seed,boundaryAt);
    const visualPoint=orientPoint(finalPoint.x,finalPoint.y,seed);
    return createBilliardPath({x:visualPoint[0],y:visualPoint[1]},seed,room.roundNo);
  },[key,seed,room?.target?.x,room?.target?.y,room?.roundNo]);
  const offsetRef=useRef(clockOffset),audioRef=useRef(audioController);
  offsetRef.current=clockOffset;audioRef.current=audioController;
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
    const displayCtx=ctx,background=document.createElement('canvas');
    const terrainCtx=background.getContext('2d');
    if(!terrainCtx)return;
    let lastTerrainTime=-Infinity,terrainPainted=false;
    let lastT=null,lastAudioTime=-Infinity,lastPaintTime=-Infinity;
    const reducedMotion=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
    const render=now=>{
      frame=0;
      if(!alive || document.hidden)return;
      const el=canvas.current;
      if(reducedMotion && now-lastPaintTime<100){frame=requestAnimationFrame(render);return;}
      lastPaintTime=now;
      if(!el)return;
      const width=el.clientWidth||320,dpr=Math.min(window.devicePixelRatio||1,2);
      const size=Math.round(width*dpr);
      if(el.width!==size){el.width=size;el.height=size;terrainPainted=false;}
      if(background.width!==size){background.width=size;background.height=size;terrainPainted=false;}
      // Freeze the expensive fluid tessellation between bet changes; the ball,
      // impact particles and reflections render independently at display FPS.
      const morphing=state.current.start && now-state.current.start<680;
      const shouldPaint=!terrainPainted ||
        (morphing && now-lastTerrainTime>(shares.length>300?75:32)) ||
        (room?.status==='RESULT' && shares.length<80 && now-lastTerrainTime>55);
      const n=width;
      if(shouldPaint){
        ctx=terrainCtx;
        ctx.setTransform(dpr,0,0,dpr,0,0);
        ctx.clearRect(0,0,n,n);
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
      terrainPainted=true;
      lastTerrainTime=now;
      }
      ctx=displayCtx;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,n,n);
      ctx.drawImage(background,0,0,n,n);
      const active=['LOCKED','ROLLING','RESULT'].includes(room?.status);
      const t=room?.status==='RESULT'?1:room?.status==='LOCKED'?0:clamp(
        (Date.now()+offsetRef.current-Date.parse(room?.rollingAt))/
        Math.max(1,Date.parse(room?.rollEndsAt)-Date.parse(room?.rollingAt)),0,1);
      const point=trajectory?trajectory.position(t):[.5,.5];
      if(trajectory && room?.status==='ROLLING'){
        // Sound follows server-synchronized wall impacts, never React renders.
        // Fast-forwarding from a background tab does not replay missed hits.
        if(lastT!==null && t>=lastT && t-lastT<.08 && !document.hidden){
          const collisions=trajectory.impacts.filter(hit=>hit.t>lastT && hit.t<=t);
          if(collisions.length)audioRef.current?.impact(1-t*.55);
        }
        lastT=t;
        if(now-lastAudioTime>95){audioRef.current?.progress(t);lastAudioTime=now;}
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
          // Single GPU-friendly transform; animating left/top triggers layout.
          const xpos=(point[0]*n).toFixed(2),ypos=(point[1]*n).toFixed(2);
          const velocity=trajectory?billiardVelocity(trajectory,t):[0,0];
          const speed=Math.hypot(...velocity);
          orb.current.style.setProperty('--ring-spin',ringRotation(t,seed)+'deg');
          orb.current.style.setProperty('--ring-intensity',(1+Math.min(.25,speed*.012)).toFixed(3));
          orb.current.style.transform='translate3d('+xpos+'px,'+ypos+'px,0) translate(-50%,-50%) scale('+
            (room.status==='RESULT'?1.14:1)+')';
        }
      }
      frame=requestAnimationFrame(render);
    };
    const onVisibility=()=>{
      if(document.hidden){cancelAnimationFrame(frame);frame=0;}
      else if(alive && !frame)frame=requestAnimationFrame(render);
    };
    document.addEventListener('visibilitychange',onVisibility);
    if(!document.hidden)frame=requestAnimationFrame(render);
    return()=>{
      alive=false;
      document.removeEventListener('visibilitychange',onVisibility);
      cancelAnimationFrame(frame);
    };
  },[room?.roundId,room?.status,room?.winnerId,room?.target?.x,room?.target?.y,key,seed,trajectory]);
  return <div className={styles.boardShell}>
    <div className={styles.board} aria-label="Stavkalarga mos, egri chegarali rangli maydon">
      <canvas ref={canvas} className={styles.canvas}/>
      {shares.map((entry,i)=>{
        // Tiny bands remain on Canvas but need no hidden DOM label.
        if(entry.share<.065)return null;
        const [x,y]=labelPoint(shares,seed,i);
        return <div key={entry.seat} className={styles.areaTag}
          style={{left:(x*100)+'%',top:(y*100)+'%',borderColor:arenaColorForSeat(entry.seat),
            display:entry.share<.065?'none':undefined}}>
          <span className={styles.areaAvatar}>{(entry.name||'P')[0]}</span>
          <strong>{entry.name}</strong>
          <small>{(entry.share*100).toFixed(1)}%</small>
        </div>;
      })}
      <span ref={orb} className={styles.ring} aria-hidden="true">
        <span className={styles.ringCross}><i className={styles.ringDot}/></span>
      </span>
    </div>
      {room?.status==='RESULT' ? <div className={styles.winStrip}>
        <div className={styles.victoryParticles} aria-hidden="true">
          {Array.from({length:26},(_,i)=><i key={i} style={{'--i':i,'--dx':(i*37)%105-52,'--dy':(i*53)%100-65,'--delay':i%6}}/>)}
        </div>
        <Crown size={28}/><span>G‘OLIB</span><strong>{room.winnerName||'Player'}</strong>
        <b>+{fmt(room.pot)} {STARS}</b>
      </div>:null}
    <div className={styles.boardFooter}><span><i/> FAIR AREA SYSTEM</span><span>100% TAQSIMLANGAN</span></div>
  </div>;
}
export default function ColorArena({onBack,apiPost,onToast,balance,onBalanceChange}) {
  const [room,setRoom]=useState(null);
  const [soundOn,setSoundOn]=useState(false);
  const audio=useRef(null),playedVictory=useRef(null);
  // Audio is opt-in: only initialize Web Audio when the user taps sound.
  const toggleSound=()=>{
    if(!audio.current)audio.current=createArenaAudio();
    const enabled=!soundOn;
    const resume=audio.current.setMuted(!enabled);
    setSoundOn(enabled);
    if(enabled && room?.status==='ROLLING'){
      // Unlock happens in this tap handler. Resume asynchronously on Safari.
      void resume?.then(ok=>{if(ok)audio.current?.startRoll();});
    }
  };
  useEffect(()=>()=>audio.current?.dispose(),[]);
  useEffect(()=>{
    if(!audio.current)return;
    if(!soundOn){audio.current.stopRoll();return;}
    if(room?.status==='ROLLING')audio.current.startRoll();
    else audio.current.stopRoll();
    if(room?.status==='RESULT'&&playedVictory.current!==room.roundId){
      playedVictory.current=room.roundId;
      audio.current.win();
    }
  },[room?.status,room?.roundId,soundOn]);
  useEffect(()=>{
    const pause=()=>{if(document.hidden)audio.current?.stopRoll();
      else if(soundOn&&room?.status==='ROLLING')audio.current?.startRoll();};
    document.addEventListener('visibilitychange',pause);
    return()=>document.removeEventListener('visibilitychange',pause);
  },[soundOn,room?.status]);
  const balanceCallback=useRef(onBalanceChange);
  balanceCallback.current=onBalanceChange;
  const [loading,setLoading]=useState(true),[busy,setBusy]=useState(''),[error,setError]=useState('');
  const [stake,setStake]=useState(10),[raise,setRaise]=useState(10);
  const [clock,setClock]=useState(Date.now()),[offset,setOffset]=useState(0);
  const syncBusy=useRef(false),pending=useRef(new Map());
  const call=useCallback((action,payload={})=>
    apiPost('/api/color-arena',{action,...payload},{timeoutMs:14000}),[apiPost]);
  const apply=useCallback(data=>{
    if(data?.balance!=null)balanceCallback.current?.(Number(data.balance));
    if(data?.serverNow)setOffset(Number(data.serverNow)-Date.now());
    if(data?.room)setRoom(previous=>{
      if(previous?.id===data.room.id && previous.roundId===data.room.roundId &&
         Number(previous.version)>=Number(data.room.version))return previous;
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
      onToast?.(action==='raise'?'Stavka oshirildi':action==='join'?'Stavka qabul qilindi':'Stavka qaytarildi');
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
  const leaders=room?.players
    ?[...room.players].sort((a,b)=>b.stake-a.stake).slice(0,12):[];
  if(myBet&&!leaders.some(p=>p.id===myBet.id))leaders.push(myBet);
  return <section className={styles.root}>
    <header className={styles.header}>
      <button type="button" className={styles.back} onClick={onBack} aria-label="PvP bo‘limiga qaytish">
        <ArrowLeft size={19}/></button>
      <strong className={styles.compactTitle}>COLOR ARENA</strong>
      <button type="button" className={styles.soundButton} onClick={toggleSound}
        aria-label={soundOn?'Arena ovozini o‘chirish':'Arena ovozini yoqish'}
        aria-pressed={soundOn} title={soundOn?'Ovozni o‘chirish':'Ovozni yoqish'}>
        {soundOn?<Volume2 size={18}/>:<VolumeX size={18}/>}
      </button>
      <span className={styles.round}>#{room?.roundNo||'—'}</span>
    </header>
    {loading&&!room?<div className={styles.notice}>Arena yuklanmoqda…</div>:null}
    {room?<div className={styles.inRoom}>
      <div className={styles.stats}>
        <div><small>UMUMIY FOND</small><strong>{fmt(room.pot)} <b>{STARS}</b></strong></div>
        <div><small>O‘YINCHILAR</small><strong><Users size={15}/>{fmt(room.players.length)} <b>∞</b></strong></div>
        <div><small>{room.status==='BETTING'?'STAVKA VAQTI':'BOSQICH'}</small>
          <strong><Timer size={15}/>{room.status==='BETTING'?seconds(room.bettingEndsAt)+'s':
            room.status==='ROLLING'?seconds(room.rollEndsAt)+'s':
            room.status==='RESULT'?'FINISH':room.status==='LOCKED'?'READY':'●'}</strong></div>
      </div>
      <ArenaCanvas room={room} clockOffset={offset} audioController={soundOn?audio.current:null}/>
      {canBet&&!myBet?<div className={styles.betPanel}>
        <div className={styles.panelHead}>
          <strong>Stavka qo‘yish</strong><span>Min {room.minStake} {STARS}</span>
        </div>
        <div className={styles.quick}>
          {[room.minStake,25,50,100].filter((v,i,a)=>a.indexOf(v)===i).map(n=>
            <button type="button" key={n} onClick={()=>setStake(n)}>{n}</button>)}
        </div>
        <div className={styles.betRow}>
          <input aria-label="Stavka miqdori" type="number" min={room.minStake} max="200000"
            value={stake} onChange={e=>setStake(e.target.value)}/>
          <button type="button" className={styles.primary}
            disabled={!!busy||Number(stake)<room.minStake||Number(stake)>Number(balance||0)}
            onClick={()=>act('join',{stake:Number(stake)})}>
            <Plus size={16}/> Qo‘shilish
          </button>
        </div>
      </div>:null}
      {canBet&&myBet?<div className={styles.betPanel}>
        <div className={styles.panelHead}><strong>Hududingizni kengaytiring</strong>
          <span>{fmt(myBet.stake)} {STARS} tikilgan</span></div>
        <div className={styles.quick}>
          {[5,10,25,50,100].map(n=><button type="button" key={n} onClick={()=>setRaise(n)}>{n}</button>)}
        </div>
        <div className={styles.betRow}>
          <input type="number" min="1" max="200000" aria-label="Qo‘shimcha stavka"
            value={raise} onChange={e=>setRaise(e.target.value)}/>
          <button type="button" className={styles.primary}
            disabled={!!busy||Number(raise)<1||Number(raise)>Number(balance||0)}
            onClick={()=>act('raise',{amount:Number(raise)})}>
            <Plus size={16}/> Oshirish</button>
        </div>
      </div>:null}
      <div className={styles.playersTitle}>
        <strong>O‘yinchilar</strong><span>{fmt(room.players.length)} ta hudud · TOP 12</span>
      </div>
      <div className={styles.players}>
        {leaders.length?leaders.map(p=><div className={styles.player} key={p.seat}>
          <span className={styles.playerAvatar} style={{
            borderColor:arenaColorForSeat(p.seat),color:arenaColorForSeat(p.seat)
          }}>{(p.name||'P')[0]}</span>
          <span className={styles.playerName}>{p.name}{p.isMe?<small>SIZ</small>:null}</span>
          <strong>{fmt(p.stake)} {STARS}</strong>
          <b style={{color:arenaColorForSeat(p.seat)}}>{p.percentage.toFixed(2)}%</b>
        </div>):<p className={styles.notice}>Birinchi stavkani qo‘ying, hududingiz paydo bo‘ladi.</p>}
      </div>
      {room.status==='WAITING'?<p className={styles.hint}>Ikkinchi o‘yinchi kutilmoqda</p>:null}
      {room.status==='WAITING'&&myBet&&room.players.length===1?
        <button type="button" className={styles.cancel} disabled={!!busy}
          onClick={()=>act('leave')}>O‘yin boshlanmasidan stavkani qaytarish</button>:null}

      <div className={styles.history}><h4><Eye size={15}/> So‘nggi g‘oliblar</h4>
        {room.history.length?room.history.map(h=><div key={h.round_id}>
          <span>#{h.round_no}</span>
          <strong>Player {String(h.winner_id).slice(-4)}</strong>
          <b>+{fmt(h.pot)} {STARS}</b>
        </div>):<small>Hozircha g‘oliblar tarixi yo‘q.</small>}
      </div>
    </div>:null}
    {!room&&!loading?<button type="button" className={styles.primary} onClick={()=>void refresh(false)}>
      <RefreshCw size={16}/> Arenaga qayta ulanish</button>:null}
    {error?<p role="alert" className={styles.error}>{error}</p>:null}
  </section>;
}
