'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, ArrowUpRight, Circle, Grid2X2, Plus, RotateCcw, Scissors, Shield, Sparkles, Users, X } from 'lucide-react';
import styles from './PvpHub.module.css';
import { evaluateBoard, resolveRps } from '@/lib/pvpGames.mjs';

const OPTIONS = [
  { value: 'rock', label: 'Tosh', symbol: '✊' },
  { value: 'paper', label: 'Qog‘oz', symbol: '✋' },
  { value: 'scissors', label: 'Qaychi', symbol: '✌️' },
];
const CHOICE_MAP = Object.fromEntries(OPTIONS.map((choice) => [choice.value, choice]));
function scoreBoard(score) {
  return <div className={styles.scoreBoard}>
    <span><b>{score[0]}</b> Player 1</span>
    <span className={styles.scoreSeparator}>VS</span>
    <span>Player 2 <b>{score[1]}</b></span>
  </div>;
}
export function PvpEntryCard({ onClick }) {
  return (
    <button type="button" className={styles.entryCard} onClick={onClick}>
      <span className={styles.entryIcon}>
        <Image src="/feature/pvp-xo-card.webp" alt="" width={100} height={100}
          sizes="84px" unoptimized className={styles.entryArtwork}/>
      </span>
      <span className={styles.entryText}>
        <strong>PvP Arena</strong>
        <small>O‘yinlarni tanlash</small>
      </span>
      <ArrowRight size={18} aria-hidden="true"/>
    </button>
  );
}
const STAKES=[5,10,25,50];
const SAVE_KEY='myst:pvp-xo-active-v1';
function gameMessage(error) { return error?.message||'O‘yin yuklanmadi'; }
function BoardCell({value,index,isWinning,onClick,disabled}) {
 return <button type="button" disabled={disabled}
   className={`${styles.square} ${value==='X'?styles.x:value==='O'?styles.o:''} ${isWinning?styles.winning:''}`}
   onClick={onClick} aria-label={`Katak ${index+1}: ${value||'bo‘sh'}`}>
   {value==='X'?<X size={44} strokeWidth={2.8} aria-hidden="true"/>:
    value==='O'?<Circle size={40} strokeWidth={2.8} aria-hidden="true"/>:
    <span className={styles.cellPoint} aria-hidden="true"/>}
 </button>;
}
function VictoryReveal({match,onClose}) {
 const particles=Array.from({length:22},(_,i)=>i);
 return <div className={styles.victoryShade} role="dialog" aria-modal="true" aria-labelledby="xo-victory-heading">
   <div className={styles.victoryPanel}>
    <div className={styles.victoryBackdropArt} aria-hidden="true">
     <Image src="/feature/giftmyst-liquid-v30/pvp-premium-3d-v30.png" fill sizes="350px" alt="" unoptimized/>
    </div>
    <div className={styles.victoryParticles} aria-hidden="true">
     {particles.map(i=><i key={i} style={{
      '--p-left':`${(i*37+17)%100}%`,
      '--p-delay':`${(i%7)*-0.16}s`,
      '--p-duration':`${1.9+(i%5)*.22}s`,
      '--p-color':i%3===0?'#f5cc73':i%3===1?'#cfa2ff':'#8de8de'
     }}/>)}
    </div>
    <div className={styles.victoryHeading}><span>MYST / ARENA</span>
      <h2 id="xo-victory-heading">G‘ALABA!</h2><p>Zo‘r o‘yin! Duel sizniki.</p></div>
    <div className={styles.victoryArt}>
      <span className={styles.victoryRing} aria-hidden="true"/>
      <Image src="/feature/pvp-victory-trophy.svg" width={205} height={205}
       alt="Oltin g‘alaba kubogi" priority unoptimized className={styles.victoryTrophy}/>
    </div>
    <div className={styles.victoryReward}>
      <span>YUTUQ</span><strong>+{Number(match.stake)*2} <b>★</b></strong>
      <small>Jami yutuq · {Number(match.stake)} Stars sof foyda</small>
    </div>
    <button type="button" className={styles.playPrimary} onClick={onClose}>
      <Sparkles size={18}/> Davom etish <ArrowRight size={17}/>
    </button>
   </div>
 </div>;
}
function TicTacToe({onBack,apiPost,balance,onBalanceChange,onToast,onRps}) {
 const [stake,setStake]=useState(10);
 const [match,setMatch]=useState(null);
 const [rooms,setRooms]=useState([]);
 const [roomsBusy,setRoomsBusy]=useState(true);
 const [showCreate,setShowCreate]=useState(false);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [confirmExit,setConfirmExit]=useState(false);
 const [winDismissed,setWinDismissed]=useState(null);
 const [clock,setClock]=useState(0);
 const syncBusy=useRef(false);
 const actionBusy=useRef(false);
 const onBalanceRef=useRef(onBalanceChange);
 onBalanceRef.current=onBalanceChange;
 const isLive=match?.status==='waiting'||match?.status==='active';
 const yourMark=match?.your_mark||'X';
 const board=Array.from({length:9},(_,i)=>match?.board?.[i]&&match.board[i]!=='.'?match.board[i]:null);
 const result=evaluateBoard(board);
 const finished=match?.status==='finished';
 const won=finished&&match.winner===yourMark;
 const lost=finished&&match.winner!=='D'&&match.winner!==yourMark;
 const myTurn=match?.status==='active'&&match.turn===yourMark;
 const timeRemaining=match?.deadline?Math.max(0,Math.ceil((new Date(match.deadline).getTime()-Date.now())/1000)):null;
 useEffect(()=>{
  if(!isLive)return undefined;
  const id=window.setInterval(()=>setClock(v=>v+1),1000);
  return ()=>window.clearInterval(id);
 },[isLive]);
 const applyResponse=useCallback((data)=>{
  if(!data?.match)return;
  const item=data.match;
  if(item.status==='cancelled'){
   setMatch(null);
   try{localStorage.removeItem(SAVE_KEY)}catch{}
  }else{
   setMatch(current=>(current?.id===item.id&&new Date(current.updated_at).getTime()>new Date(item.updated_at).getTime())?current:item);
   try{
    if(['waiting','active'].includes(item.status))localStorage.setItem(SAVE_KEY,item.id);
    else localStorage.removeItem(SAVE_KEY);
   }catch{}
  }
  if(data.balance!=null)onBalanceRef.current?.(Number(data.balance));
 },[]);
 useEffect(()=>{
  let gone=false;
  try{
   const saved=localStorage.getItem(SAVE_KEY);
   if(saved)apiPost('/api/pvp-xo',{action:'state',matchId:saved},{timeoutMs:9000})
     .then(data=>{if(!gone)applyResponse(data)})
     .catch(()=>{if(!gone)try{localStorage.removeItem(SAVE_KEY)}catch{}});
  }catch{}
  return()=>{gone=true};
 },[apiPost,applyResponse]);
 // Browse only real, unexpired rooms. Server decides membership and balances.
 useEffect(()=>{
  if(isLive||finished)return undefined;
  let closed=false;
  const refresh=async()=>{
   try{
    const data=await apiPost('/api/pvp-xo',{action:'list'},{timeoutMs:9000});
    if(closed)return;
    setRooms(Array.isArray(data.games)?data.games:[]);
    if(data.myMatchId&&!actionBusy.current){
     const active=await apiPost('/api/pvp-xo',{action:'state',matchId:data.myMatchId},{timeoutMs:9000});
     if(!closed)applyResponse(active);
    }
   }catch(e){if(!closed)setError(prev=>prev||gameMessage(e));}
   finally{if(!closed)setRoomsBusy(false)}
  };
  void refresh();
  const timer=window.setInterval(refresh,3500);
  return()=>{closed=true;window.clearInterval(timer)};
 },[apiPost,applyResponse,isLive,finished]);
 useEffect(()=>{
  if(!isLive||!match?.id)return undefined;
  let stopped=false;
  const tick=async()=>{
   if(syncBusy.current||actionBusy.current)return;
   syncBusy.current=true;
   try{
    const data=await apiPost('/api/pvp-xo',{action:'state',matchId:match.id},{timeoutMs:9000});
    if(!stopped)applyResponse(data);
   }catch{/* retry silently when connection recovers */}
   finally{syncBusy.current=false}
  };
  const timer=window.setInterval(tick,1600);
  return()=>{stopped=true;window.clearInterval(timer)};
 },[isLive,match?.id,apiPost,applyResponse]);
 async function act(action,payload={}) {
  if(actionBusy.current)return;
  actionBusy.current=true;setBusy(action);setError('');
  try{
   const data=await apiPost('/api/pvp-xo',{action,...payload},{timeoutMs:14000});
   applyResponse(data);
   if(action==='create'){
    setShowCreate(false);
    onToast?.('Duel yaratildi. Raqib kutilmoqda.');
   }
   if(action==='join')onToast?.('Duel boshlandi!');
  }catch(e){
   setError(gameMessage(e));
   if(['move','join'].includes(action)&&match?.id){
    try{applyResponse(await apiPost('/api/pvp-xo',{action:'state',matchId:match.id},{timeoutMs:9000}))}catch{}
   }
  }finally{actionBusy.current=false;setBusy('')}
 }
 const exit=()=>{if(isLive)setConfirmExit(true);else onBack()};
 const cancel=async()=>{setConfirmExit(false);if(match?.id)await act('cancel',{matchId:match.id});else onBack()};
 const label=match?.status==='waiting'?'Raqib qo‘shilishini kuting':finished
  ?match.winner==='D'?'Durrang · tikish qaytarildi':won?'G‘alaba!':'Raqib g‘olib bo‘ldi'
  :match?.status==='active'?myTurn?'Sizning yurishingiz':'Raqibning yurishi':'';
 return <section className={styles.playArea}>
  <div className={styles.arenaTop}>
   <button className={styles.inlineBack} type="button" onClick={exit}><ArrowLeft size={17}/> PvP</button>
   <span className={styles.arenaLive}><span/> X/O LIVE</span>
  </div>
  <div className={styles.arenaIntro}>
   <span>REAL PLAYER MATCHES</span><h2>X <i>VS</i> O</h2>
   <p>Haqiqiy raqib · bitta g‘olib</p>
  </div>

  {!isLive&&!finished ? <>
   <div className={styles.lobbyHeader}>
    <div><span className={styles.lobbyEyebrow}>OCHIQ ARENA</span><h3>Yaratilgan o‘yinlar</h3></div>
    <button type="button" className={styles.createRoomButton} onClick={()=>setShowCreate(v=>!v)}
      aria-expanded={showCreate}><Plus size={16}/>{showCreate?'Yopish':'O‘yin yaratish'}</button>
   </div>
   {showCreate ? <div className={styles.gameSetup}>
    <div className={styles.stakeHeading}><strong>Tikish miqdori</strong><span>Balans: {Number(balance||0).toLocaleString('en-US')} ★</span></div>
    <div className={styles.stakes} role="group" aria-label="Stars tikish miqdori">
     {STAKES.map(n=><button key={n} type="button" aria-pressed={stake===n}
       className={stake===n?styles.stakeSelected:''} onClick={()=>setStake(n)}>{n} <b>★</b></button>)}
    </div>
    <div className={styles.pot}><span>Umumiy yutuq</span><strong>{stake*2} ★</strong></div>
    <button type="button" className={styles.playPrimary}
     disabled={Boolean(busy)||Number(balance||0)<stake}
     onClick={()=>act('create',{stake})}><Plus size={17}/>{busy?'Yaratilmoqda…':'Duel yaratish'}</button>
    <p className={styles.playRule}>Tikish faqat raqib qo‘shilganda ikkala balansdan yechiladi.</p>
   </div> : null}
   <div className={styles.openRooms} aria-label="Ochiq duel ro‘yxati">
    {roomsBusy ? <div className={styles.roomsPlaceholder}><span className={styles.spinner}/> O‘yinlar yuklanmoqda…</div>
     : rooms.length ? rooms.map(room=><div key={room.id} className={styles.roomCard}>
      <div className={styles.roomAvatar}><Grid2X2 size={24}/></div>
      <div className={styles.roomDetails}>
       <strong>{room.isMine?'Sizning duelingiz':room.owner}</strong>
       <small>{room.stake} ★ tikish <span>·</span> {Number(room.stake)*2} ★ yutuq</small>
      </div>
      <button type="button" disabled={room.isMine||Boolean(busy)||Number(balance||0)<Number(room.stake)}
       className={styles.roomJoin} onClick={()=>act('join',{matchId:room.id})}>
        {room.isMine?'Kutilyapti':'Qo‘shilish'} <ArrowRight size={14}/>
      </button>
     </div>)
    : <div className={styles.emptyRooms}>
      <Grid2X2 size={26}/><strong>Hozircha ochiq o‘yin yo‘q</strong>
      <span>Birinchi duelni o‘zingiz yarating.</span>
    </div>}
   </div>
   <p className={styles.lobbyFootnote}>O‘yin boshlangach chiqish mag‘lubiyat hisoblanadi. Durrangda tikish qaytariladi.</p>
   {onRps ? <button type="button" className={styles.otherGame} onClick={onRps}>
     <Scissors size={18}/><span>Tosh · Qog‘oz · Qaychi <small>Bepul · bir qurilmada</small></span><ArrowRight size={16}/>
   </button>:null}
  </> : null}

  {match?.status==='waiting' ? <div className={styles.waitCard}>
    <div className={styles.searchOrb}><Users size={33}/></div>
    <strong>Raqib kutilmoqda</strong>
    <p>{match.stake} ★ tikishli o‘yin yaratildi</p>
    <span className={styles.waitNote}>Raqib qo‘shilgach ikkala tikish yechiladi.</span>
    <button type="button" className={styles.cancelButton} disabled={Boolean(busy)}
      onClick={()=>act('cancel',{matchId:match.id})}>Duelni bekor qilish</button>
   </div> : null}
  {(match?.status==='active'||finished) ? <div className={styles.matchContent}>
   <div className={styles.playerRow}>
    <div className={`${styles.playerBox} ${yourMark==='X'?styles.isMe:''}`}>
     <span className={styles.playerSymbolX}>×</span>
     <div><small>X PLAYER</small><strong>{match.x_name||'Player'}</strong></div>
    </div>
    <span className={styles.vsLabel}>VS</span>
    <div className={`${styles.playerBox} ${yourMark==='O'?styles.isMe:''}`}>
     <span className={styles.playerSymbolO}>○</span>
     <div><small>O PLAYER</small><strong>{match.o_name||'Player'}</strong></div>
    </div>
   </div>
   <div className={styles.matchStatus} role="status">
    <span className={finished?(won?styles.winText:lost?styles.loseText:styles.drawText):''}>{label}</span>
    {!finished&&timeRemaining!==null?<small>{timeRemaining}s</small>:null}
   </div>
   <div className={styles.boardFrame}><div className={styles.board} role="group" aria-label="X O o‘yin maydoni">
    {board.map((value,i)=><BoardCell key={i} value={value} index={i}
      isWinning={Boolean(result?.winner!=='draw'&&result?.line?.includes(i))}
      disabled={!myTurn||Boolean(value)||Boolean(busy)||finished}
      onClick={()=>act('move',{matchId:match.id,cell:i})}/>)}
   </div></div>
   <div className={styles.gameFooter}><span>★ {match.stake*2} Stars</span><span>ONLINE DUEL</span></div>
   {finished?<button type="button" className={styles.playPrimary} onClick={()=>{setWinDismissed(match.id);setMatch(null);setError('')}}>
     <RotateCcw size={17}/> Boshqa duel <ArrowRight size={17}/></button>
    : <button type="button" className={styles.leaveLink} onClick={()=>setConfirmExit(true)}>Duelni tark etish</button>}
  </div> : null}
  {error?<p className={styles.gameError} role="alert">{error}</p>:null}
  {won&&winDismissed!==match?.id?<VictoryReveal match={match} onClose={()=>setWinDismissed(match.id)}/>:null}
  {confirmExit?<div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="pvp-exit-title">
    <div className={styles.confirmCard}><Shield size={25}/><h3 id="pvp-exit-title">Duelni tark etasizmi?</h3>
     <p>{match?.status==='active'?'Mag‘lubiyat hisoblanadi va tikish raqibga o‘tadi.':'Raqib qo‘shilmasdan duel bekor qilinadi.'}</p>
     <div><button type="button" onClick={()=>setConfirmExit(false)}>Qolish</button>
     <button type="button" disabled={Boolean(busy)} onClick={cancel}>Ha, chiqish</button></div>
    </div>
   </div>:null}
 </section>;
}
function RockPaperScissors({ onBack }) {
  const [phase,setPhase] = useState('p1');
  const [p1,setP1] = useState('');
  const [p2,setP2] = useState('');
  const [scores,setScores] = useState([0,0]);
  const select = (choice) => {
    if(phase === 'p1') { setP1(choice);setPhase('pass');return; }
    if(phase !== 'p2') return;
    setP2(choice);
    const winner = resolveRps(p1, choice);
    if(winner >= 0) setScores(current => current.map((x,i) => x+(i===winner?1:0)));
    setPhase('result');
  };
  const again = () => {setP1('');setP2('');setPhase('p1');};
  const winner = resolveRps(p1, p2);
  return (
    <section className={styles.playArea}>
      <button className={styles.inlineBack} type="button" onClick={onBack}><ArrowLeft size={16}/> O‘yinlar</button>
      <div className={styles.playHeading}><span>SECRET MOVE DUEL</span><h2>Tosh · Qog‘oz · Qaychi</h2><p>Tanlovlar navbat bilan yashirin qilinadi</p></div>
      {scoreBoard(scores)}
      {phase === 'pass' ? (
        <div className={styles.passScreen} role="status">
          <Shield size={38}/><h3>Player 1 tanladi</h3>
          <p>Telefonni Player 2 ga bering. Birinchi tanlov ko‘rsatilmaydi.</p>
          <button type="button" className={styles.resetButton} onClick={() => setPhase('p2')}>Player 2, boshlash <ArrowRight size={16}/></button>
        </div>
      ) : phase === 'result' ? (
        <div className={styles.rpsResult}>
          <div className={styles.rpsReveal}>
            <span><b>PLAYER 1</b><i>{CHOICE_MAP[p1]?.symbol}</i><small>{CHOICE_MAP[p1]?.label}</small></span>
            <strong>VS</strong>
            <span><b>PLAYER 2</b><i>{CHOICE_MAP[p2]?.symbol}</i><small>{CHOICE_MAP[p2]?.label}</small></span>
          </div>
          <div className={styles.status} role="status">{winner === -1 ? 'Durrang!' : `Player ${winner+1} g‘olib!`}</div>
          <button className={styles.resetButton} type="button" onClick={again}><RotateCcw size={16}/> Yana o‘ynash</button>
        </div>
      ) : (
        <>
          <div className={styles.status} role="status">{phase === 'p1' ? 'Player 1' : 'Player 2'} — tanlovingizni belgilang</div>
          <div className={styles.choices}>{OPTIONS.map(o => (
            <button type="button" key={o.value} onClick={()=>select(o.value)} className={styles.choice} aria-label={o.label}>
              <span>{o.symbol}</span><strong>{o.label}</strong>
            </button>
          ))}</div>
        </>
      )}
    </section>
  );
}
export default function PvpHub({onBack,apiPost,balance,onBalanceChange,onToast}) {
 const [selected,setSelected]=useState('list');
 if(selected==='xo')return <div className={styles.root}>
  <TicTacToe onBack={()=>setSelected('list')} apiPost={apiPost} balance={balance}
   onBalanceChange={onBalanceChange} onToast={onToast}/>
 </div>;
 if(selected==='rps')return <div className={styles.root}>
  <RockPaperScissors onBack={()=>setSelected('list')}/>
 </div>;
 return <section className={`${styles.root} ${styles.catalogRoot}`}>
  <header className={styles.topbar}>
   <button type="button" className={styles.back} aria-label="Orqaga qaytish" onClick={onBack}>
    <ArrowLeft size={19}/>
   </button>
   <div><small>MYST ARCADE</small><strong>PvP Arena</strong></div>
   <span className={styles.localTag}><span className={styles.onlineDot}/> LIVE</span>
  </header>
  <div className={styles.catalogHeading}>
    <div>
      <span className={styles.catalogKicker}>GAME COLLECTION</span>
      <h1>O‘yinlar</h1>
    </div>
    <span className={styles.catalogCounter}>02</span>
  </div>
  <div className={styles.storeGrid}>
   <button type="button" className={styles.storeItem}
     onClick={()=>setSelected('xo')} aria-label="X/O Duel o‘yinini ochish">
    <span className={styles.storeCover}>
     <Image src="/feature/pvp-xo-card.webp" alt="" width={480} height={480}
       sizes="(max-width: 480px) 44vw, 240px" unoptimized priority
       className={styles.storeCoverImage}/>
    </span>
    <span className={styles.storeLabelRow}>
      <strong>X/O Duel</strong>
      <ArrowUpRight size={17} aria-hidden="true"/>
    </span>
   </button>
   <button type="button" className={styles.storeItem}
     onClick={()=>setSelected('rps')} aria-label="Tosh, Qog‘oz, Qaychi o‘yinini ochish">
    <span className={`${styles.storeCover} ${styles.rpsCover}`}>
      <span className={styles.rpsOrbit} aria-hidden="true"/>
      <span className={styles.rpsSymbolBack} aria-hidden="true"><Scissors size={64} strokeWidth={2.2}/></span>
      <span className={styles.rpsTokenOne} aria-hidden="true">✊</span>
      <span className={styles.rpsTokenTwo} aria-hidden="true">✋</span>
      <span className={styles.rpsTokenThree} aria-hidden="true">✌️</span>
      <span className={styles.rpsLight} aria-hidden="true"/>
    </span>
    <span className={styles.storeLabelRow}>
      <strong>Tosh · Qog‘oz · Qaychi</strong>
      <ArrowUpRight size={17} aria-hidden="true"/>
    </span>
   </button>
  </div>
 </section>;
}
