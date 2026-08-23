'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, ShieldCheck, TrendingDown, TrendingUp } from 'lucide-react';
import styles from './DiceGame.module.css';

const MIN_TARGET = 5;
const MAX_TARGET = 95;
const MAX_BET = 10000;
const HOUSE_EDGE = 3;
const QUICK_BETS = [10, 25, 50, 100];

const STAR_FORMATTER = new Intl.NumberFormat('uz-UZ', {
  maximumFractionDigits: 0,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function safeInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.floor(number) : fallback;
}

function formatStars(value) {
  return STAR_FORMATTER.format(Math.max(0, safeInteger(value)));
}

function starIcon(className = '') {
  return (
    <Image
      className={className}
      src="/currency/stars.png"
      alt=""
      width={32}
      height={32}
      draggable={false}
    />
  );
}

export function DiceLobbyCard({ onClick }) {
  return (
    <button type="button" className={styles.lobbyCard} onClick={onClick} aria-label="Dice o‘yinini ochish">
      <span className={styles.lobbyGlow} aria-hidden="true" />
      <span className={styles.lobbyGrid} aria-hidden="true" />
      <span className={styles.lobbyCopy}>
        <span className={styles.lobbyBadge}><i /> YANGI O‘YIN</span>
        <strong>DICE</strong>
        <small>Chegarani tanlang. Omadingizni sinang.</small>
        <span className={styles.lobbyAction}>O‘ynash <b>›</b></span>
      </span>
      <span className={styles.lobbyArt} aria-hidden="true">
        <span className={styles.lobbyOrbit} />
        <Image src="/feature/dice/dice-logo.png" alt="" width={768} height={768} priority draggable={false} />
      </span>
      <span className={styles.lobbyOdds} aria-hidden="true">
        <em>x1.94</em><em>x3.23</em>
      </span>
    </button>
  );
}

export default function DiceGame({
  apiPost,
  profile,
  tg,
  onBack,
  onBalanceChange,
  onRoundStateChange,
  onToast,
}) {
  const [mode, setMode] = useState('higher');
  const [target, setTarget] = useState(50);
  const [bet, setBet] = useState(10);
  const [rolling, setRolling] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [localError, setLocalError] = useState('');

  const balance = Math.max(0, safeInteger(profile?.balance));
  const chance = mode === 'higher' ? 100 - target : target;
  const multiplier = useMemo(
    () => Math.floor(((100 - HOUSE_EDGE) / chance) * 100) / 100,
    [chance]
  );
  const possiblePayout = Math.max(bet + 1, Math.floor(bet * multiplier));
  const sliderFill = ((target - MIN_TARGET) / (MAX_TARGET - MIN_TARGET)) * 100;

  useEffect(() => () => onRoundStateChange?.(false), [onRoundStateChange]);

  const changeMode = useCallback((nextMode) => {
    if (rolling) return;
    setMode(nextMode);
    setResult(null);
    setLocalError('');
    tg?.HapticFeedback?.selectionChanged?.();
  }, [rolling, tg]);

  const updateBet = useCallback((value) => {
    setBet(clamp(safeInteger(value, 1), 1, Math.min(MAX_BET, Math.max(1, balance))));
    setLocalError('');
  }, [balance]);

  const play = useCallback(async () => {
    if (rolling) return;

    const normalizedBet = clamp(safeInteger(bet, 1), 1, MAX_BET);
    if (normalizedBet > balance) {
      setLocalError('Balans yetarli emas. Stavkani kamaytiring.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return;
    }

    setBet(normalizedBet);
    setRolling(true);
    setResult(null);
    setLocalError('');
    onRoundStateChange?.(true);
    tg?.HapticFeedback?.impactOccurred?.('medium');
    const startedAt = Date.now();

    try {
      const data = await apiPost('/api/dice', {
        action: 'play',
        mode,
        target,
        bet: normalizedBet,
      });
      const waitMs = Math.max(0, 900 - (Date.now() - startedAt));
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));

      const nextResult = data?.result;
      if (!nextResult) throw new Error('Dice natijasi olinmadi.');

      setResult(nextResult);
      setRecent((items) => [nextResult, ...items].slice(0, 6));
      onBalanceChange?.(data.balance);
      tg?.HapticFeedback?.notificationOccurred?.(nextResult.won ? 'success' : 'error');
      onToast?.(
        nextResult.won
          ? `+${formatStars(nextResult.profit)} Stars yutdingiz!`
          : `${formatStars(nextResult.bet)} Stars yutqazildi.`
      );
    } catch (error) {
      setLocalError(error?.message || 'Dice o‘yinida xatolik yuz berdi.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      setRolling(false);
      onRoundStateChange?.(false);
    }
  }, [apiPost, balance, bet, mode, onBalanceChange, onRoundStateChange, onToast, rolling, target, tg]);

  return (
    <section className={styles.root} aria-busy={rolling}>
      <header className={styles.header}>
        <button type="button" className={styles.backButton} onClick={onBack} disabled={rolling} aria-label="O‘yinlarga qaytish">
          <ChevronLeft />
        </button>
        <div className={styles.brand}>
          <span className={styles.logo}><Image src="/feature/dice/dice-logo.png" alt="" width={768} height={768} priority /></span>
          <div><h1>DICE</h1><span>0–100 • SERVER RNG</span></div>
        </div>
        <div className={styles.balance}>{starIcon(styles.star)}<strong>{formatStars(balance)}</strong></div>
      </header>

      <div className={styles.recent} aria-label="Oxirgi natijalar">
        {recent.length ? recent.map((item) => (
          <span key={item.id} data-win={item.won ? 'true' : 'false'}>{Number(item.roll).toFixed(2)}</span>
        )) : <><span>58.74</span><span>96.54</span><span>51.19</span><span>11.19</span></>}
      </div>

      <section className={styles.arena}>
        <div className={styles.arenaTop}>
          <div><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
          <div className={styles.scaleTicks} aria-hidden="true" />
        </div>

        <div className={styles.trackWrap} data-mode={mode} style={{ '--target': `${target}%`, '--roll': `${result?.roll ?? target}%` }}>
          <div className={styles.track} />
          <span className={styles.targetMarker}><b>{target}</b></span>
          {result ? <span className={styles.rollMarker} data-win={result.won ? 'true' : 'false'}><i>{Number(result.roll).toFixed(2)}</i></span> : null}
          {rolling ? <span className={styles.rollingMarker} /> : null}
          <input
            type="range"
            min={MIN_TARGET}
            max={MAX_TARGET}
            step="1"
            value={target}
            disabled={rolling}
            aria-label="Dice chegarasi"
            style={{ '--fill': `${sliderFill}%` }}
            onChange={(event) => { setTarget(Number(event.target.value)); setResult(null); setLocalError(''); }}
          />
        </div>

        <div className={styles.zones} data-mode={mode} style={{ '--target': `${target}%` }}>
          <span>{mode === 'higher' ? 'YUTQAZISH' : 'YUTISH'} ZONASI</span>
          <span>{mode === 'higher' ? 'YUTISH' : 'YUTQAZISH'} ZONASI</span>
        </div>
      </section>

      <section className={styles.controls}>
        <div className={styles.modeSwitch}>
          <button type="button" data-active={mode === 'lower'} onClick={() => changeMode('lower')} disabled={rolling}>
            <TrendingDown /><span>PAST</span><small>&lt; {target}</small>
          </button>
          <button type="button" data-active={mode === 'higher'} onClick={() => changeMode('higher')} disabled={rolling}>
            <TrendingUp /><span>BALAND</span><small>&gt; {target}</small>
          </button>
        </div>

        <div className={styles.statsGrid}>
          <article><span>KOEFFITSIYENT</span><strong>{multiplier.toFixed(2)}<small>×</small></strong></article>
          <article><span>YUTISH EHTIMOLI</span><strong>{chance.toFixed(2)}<small>%</small></strong></article>
        </div>
      </section>

      {result ? (
        <div className={styles.resultCard} data-win={result.won ? 'true' : 'false'}>
          <span>{result.won ? 'YUTUQ' : 'OMAD KELMADI'}</span>
          <strong>{Number(result.roll).toFixed(2)}</strong>
          <em>{result.won ? `+${formatStars(result.profit)} Stars` : `−${formatStars(result.bet)} Stars`}</em>
        </div>
      ) : null}

      <section className={styles.betPanel}>
        <div className={styles.betHeading}><span>STAVKA</span><small>Mumkin bo‘lgan yutuq: {formatStars(possiblePayout)} ⭐</small></div>
        <div className={styles.betField}>
          <button type="button" onClick={() => updateBet(bet - 1)} disabled={rolling || bet <= 1}>−</button>
          <label>{starIcon(styles.betStar)}<input type="number" min="1" max={Math.min(MAX_BET, Math.max(1, balance))} value={bet} disabled={rolling} onChange={(event) => updateBet(event.target.value)} /></label>
          <button type="button" onClick={() => updateBet(bet + 1)} disabled={rolling || bet >= balance}>+</button>
        </div>
        <div className={styles.quickBets}>
          {QUICK_BETS.map((amount) => <button key={amount} type="button" onClick={() => updateBet(amount)} disabled={rolling || amount > balance}>{amount}</button>)}
          <button type="button" onClick={() => updateBet(Math.min(balance, MAX_BET))} disabled={rolling || balance <= 0}>MAX</button>
        </div>
        {localError ? <p className={styles.error}>{localError}</p> : null}
        <button type="button" className={styles.playButton} onClick={play} disabled={rolling || balance < 1}>
          {rolling ? <><span className={styles.buttonDice} /> NATIJA ANIQLANMOQDA...</> : <>{starIcon(styles.buttonStar)} {formatStars(bet)} STARS BILAN O‘YNASH</>}
        </button>
        <div className={styles.security}><ShieldCheck /> Natija serverdagi xavfsiz random orqali yaratiladi</div>
      </section>
    </section>
  );
}
