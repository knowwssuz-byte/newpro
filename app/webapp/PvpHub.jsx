'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { ArrowLeft, ArrowRight, Check, Circle, Grid2X2, RotateCcw, Scissors, Shield, Swords, Users, X } from 'lucide-react';
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
      <span className={styles.entryIcon}><Swords size={23}/></span>
      <span className={styles.entryText}><strong>PvP Arena</strong><small>X/O · bot va jonli raqib</small></span>
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
function TicTacToe({onBack,apiPost,balance,onBalanceChange,onToast}) {
 const [mode,setMode]=useState('bot');
 const [stake,setStake]=useState(10);
 const [match,setMatch]=useState(null);
 const [busy,setBusy]=useState('');
 const [error,setError]=useState('');
 const [confirmExit,setConfirmExit]=useState(false);
 const syncBusy=useRef(false);
 const actionBusy=useRef(false);
 const isLive=match?.status==='waiting'||match?.status==='active';
 const isX=match?.x_id!=null && String(match.x_id)===String(match?.viewer_id);
 // viewer_id is injected by the client from the match membership response.
 const yourMark=match?.your_mark || (match?.mode==='bot'?'X':isX?'X':'O');
 const board=Array.from({length:9},(_,i)=>match?.board?.[i]&&match.board[i]!=='.'?match.board[i]:null);
 const result=evaluateBoard(board);
 const win=match?.status==='finished';
 const lost=win && match.winner!== 'D' && match.winner!==yourMark;
 const won=win && match.winner===yourMark;
 const myTurn=match?.status==='active'&&match.turn===yourMark;
 const timeRemaining=match?.deadline?Math.max(0,Math.ceil((new Date(match.deadline).getTime()-Date.now())/1000)):null;
 const [clock,setClock]=useState(0);
 useEffect(()=>{
  if(!isLive)return undefined;
  const t=window.setInterval(()=>setClock(x=>x+1),1000);
  return()=>window.clearInterval(t);
 },[isLive]);
 const applyResponse=useCallback((data)=>{
  if(!data?.match)return;
  setMatch(current=>{
   if(current?.id===data.match.id && new Date(current.updated_at).getTime()>new Date(data.match.updated_at).getTime())
     return current;
   return data.match;
  });
  if(data.balance!=null)onBalanceChange?.(Number(data.balance));
  try{
   if(['active','waiting'].includes(data.match.status))localStorage.setItem(SAVE_KEY,data.match.id);
   else localStorage.removeItem(SAVE_KEY);
  }catch{}
 },[onBalanceChange]);
 useEffect(()=>{
  let cancelled=false;
  try{
   const saved=localStorage.getItem(SAVE_KEY);
   if(saved)apiPost('/api/pvp-xo',{action:'state',matchId:saved},{timeoutMs:8000})
     .then(data=>{if(!cancelled)applyResponse(data)})
     .catch(()=>{if(!cancelled)try{localStorage.removeItem(SAVE_KEY)}catch{}});
  }catch{}
  return()=>{cancelled=true};
 },[apiPost,applyResponse]);
 useEffect(()=>{
  if(!isLive||!match?.id)return undefined;
  let stopped=false;
  const sync=async()=>{
   if(syncBusy.current||actionBusy.current)return;
   syncBusy.current=true;
   try{
    const data=await apiPost('/api/pvp-xo',{action:'state',matchId:match.id},{timeoutMs:8500});
    if(!stopped)applyResponse(data);
   }catch{/* Connection may recover on the next poll. */}
   finally{syncBusy.current=false}
  };
  const timer=setInterval(sync,1700);
  return()=>{stopped=true;clearInterval(timer)};
 },[isLive,match?.id,apiPost,applyResponse]);
 async function act(action,payload={}) {
  if(actionBusy.current)return;
  actionBusy.current=true;
  setBusy(action);setError('');
  try{
   const data=await apiPost('/api/pvp-xo',{action,...payload},{timeoutMs:14000});
   applyResponse(data);
   if(action==='start'&&data.match.status==='waiting')onToast?.('Raqib qidirilmoqda…');
  }catch(e){
   setError(gameMessage(e));
   if(action==='move'&&match?.id) {
    try{applyResponse(await apiPost('/api/pvp-xo',{action:'state',matchId:match.id},{timeoutMs:9000}))}catch{}
   }
  }finally{actionBusy.current=false;setBusy('')}
 }
 const askExit=()=>{if(isLive){setConfirmExit(true)}else onBack()};
 const cancel=async()=>{setConfirmExit(false);if(match?.id)await act('cancel',{matchId:match.id});else onBack()};
 const start=()=>act('start',{mode,stake});
 const label=match?.status==='waiting'?'Raqib qidirilmoqda…':
  match?.status==='cancelled'?'Qidiruv bekor qilindi':
  win ? match.winner==='D'?'Durrang · tikish qaytarildi':won?'G‘alaba!':'Bu safar raqib yutdi':
  match?.status==='active'?myTurn?'Sizning navbatingiz':'Raqib yurmoqda':'';
 return (
  <section className={styles.playArea}>
   <div className={styles.arenaTop}>
    <button type="button" className={styles.inlineBack} onClick={askExit}>
      <ArrowLeft size={17}/> Arena
    </button>
    <span className={styles.arenaLive}><span/> X/O DUEL</span>
   </div>
   <div className={styles.arenaIntro}>
    <span>THE GRID / MYST ARENA</span>
    <h2>X <i>VS</i> O</h2>
    <p>3 ta bir qatorda · bitta g‘olib</p>
   </div>
   {!isLive&&!win ? (
    <div className={styles.gameSetup}>
     <div className={styles.playModeTabs} role="group" aria-label="Raqib tanlash">
      <button type="button" onClick={()=>setMode('bot')} className={mode==='bot'?styles.modeSelected:''} aria-pressed={mode==='bot'}>
       <Shield size={17}/> Bot bilan
      </button>
      <button type="button" onClick={()=>setMode('online')} className={mode==='online'?styles.modeSelected:''} aria-pressed={mode==='online'}>
       <Users size={17}/> Haqiqiy raqib
      </button>
     </div>
     <div className={styles.stakeArea}>
      <div className={styles.stakeHeading}><strong>Tikish miqdori</strong><span>⭐ {Number(balance||0).toLocaleString('en-US')}</span></div>
      <div className={styles.stakes} role="group" aria-label="Stars tikish miqdori">
       {STAKES.map(n=><button type="button" key={n} aria-pressed={stake===n}
        className={stake===n?styles.stakeSelected:''} onClick={()=>setStake(n)}>{n} <b>★</b></button>)}
      </div>
      <div className={styles.pot}><span>Mumkin bo‘lgan yutuq</span><strong>{stake*2} ★</strong></div>
     </div>
     <button type="button" className={styles.playPrimary} disabled={Boolean(busy)||Number(balance||0)<stake} onClick={start}>
      {busy?<span className={styles.spinner}/>:<Swords size={18}/>}
      {busy?'Tayyorlanmoqda…':mode==='bot'?'Botga qarshi boshlash':'Raqib topish'}
      <ArrowRight size={18}/>
     </button>
     <p className={styles.playRule}>Durrangda tikish qaytariladi. O‘yin boshlanganidan keyin chiqish mag‘lubiyat hisoblanadi.</p>
    </div>
   ) : null}
   {match?.status==='waiting' ? (
    <div className={styles.waitCard}>
     <div className={styles.searchOrb}><Users size={32}/></div>
     <strong>Raqib kutilmoqda</strong>
     <p>{match.stake} ★ tikish bilan raqib qidirilmoqda</p>
     <button type="button" className={styles.cancelButton} disabled={Boolean(busy)}
      onClick={()=>act('cancel',{matchId:match.id})}>Qidiruvni to‘xtatish</button>
    </div>
   ) : null}
   {(match?.status==='active'||win) ? (
    <div className={styles.matchContent}>
     <div className={styles.playerRow}>
      <div className={`${styles.playerBox} ${yourMark==='X'?styles.isMe:''}`}>
       <span className={styles.playerSymbolX}>×</span>
       <div><small>X PLAYER</small><strong>{match.x_name||'Player'}</strong></div>
      </div>
      <span className={styles.vsLabel}>VS</span>
      <div className={`${styles.playerBox} ${yourMark==='O'?styles.isMe:''}`}>
       <span className={styles.playerSymbolO}>○</span>
       <div><small>O PLAYER</small><strong>{match.o_name||'MYST BOT'}</strong></div>
      </div>
     </div>
     <div className={styles.matchStatus} role="status">
      <span className={win?(won?styles.winText:lost?styles.loseText:styles.drawText):''}>{label}</span>
      {!win&&timeRemaining!==null?<small>{Math.max(0,Math.ceil((new Date(match.deadline).getTime()-Date.now())/1000))}s</small>:null}
     </div>
     <div className={styles.boardFrame}>
      <div className={styles.board} role="group" aria-label="X O o‘yin maydoni">
       {board.map((value,i)=><BoardCell key={i} value={value} index={i}
        isWinning={Boolean(result?.winner!=='draw'&&result?.line?.includes(i))}
        disabled={!myTurn||Boolean(value)||Boolean(busy)||win}
        onClick={()=>act('move',{matchId:match.id,cell:i})}/>)}
      </div>
     </div>
     <div className={styles.gameFooter}>
      <span><span className={styles.potIcon}>★</span> {match.stake*2} Stars</span>
      <span>{match.mode==='bot'?'MYST BOT':'ONLINE DUEL'}</span>
     </div>
     {win ? (
      <button type="button" className={styles.playPrimary}
        onClick={()=>{setMatch(null);setError('')}}><RotateCcw size={17}/> Yana o‘ynash <ArrowRight size={17}/></button>
     ) : (
      <button type="button" className={styles.leaveLink} onClick={()=>setConfirmExit(true)}>Duelni tark etish</button>
     )}
    </div>
   ) : null}
   {match?.status==='cancelled'?(
    <button type="button" className={styles.playPrimary} onClick={()=>{setMatch(null);setError('')}}>Yangi o‘yin</button>
   ):null}
   {error?<p className={styles.gameError} role="alert">{error}</p>:null}
   {confirmExit? (
    <div className={styles.confirmOverlay} role="dialog" aria-modal="true" aria-labelledby="pvp-exit-title">
     <div className={styles.confirmCard}>
      <Shield size={25}/><h3 id="pvp-exit-title">Duelni tark etasizmi?</h3>
      <p>{match?.status==='active'?'Bu mag‘lubiyat hisoblanadi va tikish raqibga o‘tadi.':'Raqib qidirish bekor qilinadi.'}</p>
      <div><button type="button" onClick={()=>setConfirmExit(false)}>Qolish</button>
       <button type="button" disabled={Boolean(busy)} onClick={cancel}>Ha, chiqish</button></div>
     </div>
    </div>
   ):null}
  </section>
 );
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
 const [active,setActive]=useState(null);
 if(active==='xo') return <div className={styles.root}><TicTacToe onBack={()=>setActive(null)}
  apiPost={apiPost} balance={balance} onBalanceChange={onBalanceChange} onToast={onToast}/></div>;
 if(active==='rps') return <div className={styles.root}><RockPaperScissors onBack={()=>setActive(null)}/></div>;
 return <section className={styles.root}>
  <div className={styles.topbar}>
   <button type="button" className={styles.back} onClick={onBack} aria-label="Ortga qaytish"><ArrowLeft size={19}/></button>
   <div><small>MYST GAMING</small><strong>PvP Arena</strong></div>
   <span className={styles.localTag}><span className={styles.onlineDot}/> LIVE</span>
  </div>
  <div className={styles.hubIntro}>
   <span>ARENA / SELECT GAME</span>
   <h1>Play. Compete. <em>Win.</em></h1>
   <p>Bot yoki haqiqiy raqib bilan bellashing.</p>
  </div>
  <div className={styles.list}>
   <button type="button" className={styles.modeCard} onClick={()=>setActive('xo')}>
    <span className={styles.modeIcon}><Grid2X2 size={32} strokeWidth={1.8}/></span>
    <span className={styles.modeInfo}><strong>X/O Duel</strong><small>Bot / online · 5–50 Stars</small><em><Check size={12}/> O‘YNASH MUMKIN</em></span>
    <ArrowRight size={18}/>
   </button>
   <button type="button" className={styles.modeCard} onClick={()=>setActive('rps')}>
    <span className={styles.modeIcon}><Scissors size={31} strokeWidth={1.8}/></span>
    <span className={styles.modeInfo}><strong>Tosh · Qog‘oz · Qaychi</strong>
     <small>Bir qurilmada · bepul</small><em><Check size={12}/> O‘YNASH MUMKIN</em></span>
    <ArrowRight size={18}/>
   </button>
  </div>
 </section>;
}
