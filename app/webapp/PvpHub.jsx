'use client';

import { useState } from 'react';
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
      <span className={styles.entryText}><strong>PvP Arena</strong><small>2 ta mahalliy duel · X/O va Tosh–Qaychi–Qog‘oz</small></span>
      <ArrowRight size={18} aria-hidden="true"/>
    </button>
  );
}
function TicTacToe({ onBack }) {
  const [board, setBoard] = useState(Array(9).fill(null));
  const [next, setNext] = useState('X');
  const [scores, setScores] = useState([0,0]);
  const result = evaluateBoard(board);
  const mark = (index) => {
    if (board[index] || result) return;
    const nextBoard = [...board];
    nextBoard[index] = next;
    const outcome = evaluateBoard(nextBoard);
    setBoard(nextBoard);
    if (outcome && outcome.winner !== 'draw') {
      setScores((scores) => scores.map((value,i) => value + (i === (outcome.winner === 'X' ? 0 : 1) ? 1 : 0)));
    }
    setNext(next === 'X' ? 'O' : 'X');
  };
  const resetRound = () => { setBoard(Array(9).fill(null)); setNext('X'); };
  return (
    <section className={styles.playArea}>
      <button className={styles.inlineBack} type="button" onClick={onBack}><ArrowLeft size={16}/> O‘yinlar</button>
      <div className={styles.playHeading}><span>TACTICAL DUEL</span><h2>X/O Duel</h2><p>Navbat bilan bitta qurilmada o‘ynang</p></div>
      {scoreBoard(scores)}
      <div className={styles.status} role="status">
        {result ? result.winner === 'draw' ? 'Durrang! Yangi raundni boshlang.'
          : (result.winner === 'X' ? 'Player 1' : 'Player 2') + ' g‘olib!'
          : (next === 'X' ? 'Player 1 (X)' : 'Player 2 (O)') + ' navbati'}
      </div>
      <div className={styles.board} role="group" aria-label="X O o‘yin maydoni">
        {board.map((value,i) => (
          <button key={i} type="button" onClick={() => mark(i)} disabled={Boolean(value || result)}
            className={[styles.square, value === 'X' ? styles.x : value === 'O' ? styles.o : '',result?.line.includes(i) ? styles.winning : ''].join(' ')}
            aria-label={`Katak ${i+1}: ${value || 'bo‘sh'}`}>
            {value === 'X' ? <X size={38} strokeWidth={2.7} /> : value === 'O' ? <Circle size={34} strokeWidth={2.8}/> : null}
          </button>
        ))}
      </div>
      <button className={styles.resetButton} type="button" onClick={resetRound}><RotateCcw size={17}/> Yangi raund</button>
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
export default function PvpHub({ onBack }) {
  const [active,setActive] = useState(null);
  if(active === 'xo') return <div className={styles.root}><TicTacToe onBack={()=>setActive(null)} /></div>;
  if(active === 'rps') return <div className={styles.root}><RockPaperScissors onBack={()=>setActive(null)} /></div>;
  return (
    <section className={styles.root}>
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={onBack} aria-label="Ortga qaytish"><ArrowLeft size={19}/></button>
        <div><small>GAME HUB</small><strong>PvP Arena</strong></div>
        <span className={styles.localTag}><Users size={13}/> LOCAL 1V1</span>
      </div>
      <div className={styles.hero}>
        <Image src="/feature/game-banners/pvp-v41.webp" alt="" fill sizes="(max-width:600px) 100vw, 560px" unoptimized className={styles.banner} />
        <div className={styles.heroShade}/>
        <div className={styles.heroCopy}>
          <span><Swords size={15}/> ARENA OPEN</span>
          <h1>PLAYER <em>VS</em> PLAYER</h1>
          <p>Ikki o‘yinchi. Bitta qurilma. Haqiqiy navbatli bellashuvlar.</p>
        </div>
      </div>
      <header className={styles.listHeader}>
        <div><small>SELECT MODE</small><h2>PvP o‘yinlari</h2></div><span>2 ta o‘yin</span>
      </header>
      <div className={styles.list}>
        <button type="button" className={styles.modeCard} onClick={()=>setActive('xo')}>
          <span className={styles.modeIcon}><Grid2X2 size={31} strokeWidth={1.7}/></span>
          <span className={styles.modeInfo}><strong>X/O Duel</strong><small>Strategiya · navbatli 1v1</small><em><Check size={12}/> O‘YNASH MUMKIN</em></span>
          <ArrowRight size={18} />
        </button>
        <button type="button" className={styles.modeCard} onClick={()=>setActive('rps')}>
          <span className={styles.modeIcon}><Scissors size={31} strokeWidth={1.7}/></span>
          <span className={styles.modeInfo}><strong>Tosh, Qog‘oz, Qaychi</strong><small>Tezkor duel · yashirin tanlov</small><em><Check size={12}/> O‘YNASH MUMKIN</em></span>
          <ArrowRight size={18} />
        </button>
      </div>
      <div className={styles.notice}><Shield size={17}/><p>Bu o‘yinlar hozircha <strong>bir qurilmadagi ikki o‘yinchi</strong> uchun. Onlayn matchmaking va pul yoki Stars stavkalari mavjud emas.</p></div>
    </section>
  );
}
