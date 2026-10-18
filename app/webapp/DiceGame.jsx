'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import { ChevronLeft, TrendingDown, TrendingUp } from 'lucide-react';
import styles from './DiceGame.module.css';
import StarIcon from './StarIcon';

const DEFAULT_CONFIG = {
  enabled: true,
  minBet: 10,
  maxBet: 10000,
  minWinChance: 5,
  maxWinChance: 85,
  houseEdgePercent: 3,
  rollDurationMs: 1400,
};
const QUICK_BETS = [10, 25, 50, 100];
const CRUISE_SPEED = 0.24; // track percentage points per millisecond

function reflectTrackPosition(distance) {
  const remainder = ((distance % 200) + 200) % 200;
  return remainder <= 100 ? remainder : 200 - remainder;
}

function brakingDestination(start, roll, duration) {
  const idealTravel = Math.max(170, duration * 0.13);
  const candidates = [];
  for (const landing of [roll, 200 - roll]) {
    const firstLap = Math.ceil((start + 145 - landing) / 200);
    for (let lap = firstLap; lap < firstLap + 4; lap += 1) {
      const destination = landing + lap * 200;
      if (destination > start + 145) candidates.push(destination);
    }
  }
  return candidates.sort((a, b) =>
    Math.abs(a - start - idealTravel) - Math.abs(b - start - idealTravel)
  )[0] ?? start + idealTravel;
}


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
    <StarIcon variant="gold" size={32} className={className} />
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
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [rolling, setRolling] = useState(false);
  const [settling, setSettling] = useState(false);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [localError, setLocalError] = useState('');
  const ballRef = useRef(null);
  const motionRef = useRef(null);

  const balance = Math.max(0, safeInteger(profile?.balance));
  const minTarget = mode === 'higher'
    ? 100 - config.maxWinChance
    : config.minWinChance;
  const maxTarget = mode === 'higher'
    ? 100 - config.minWinChance
    : config.maxWinChance;
  const chance = mode === 'higher' ? 100 - target : target;
  const multiplier = useMemo(
    () => Math.floor(((100 - config.houseEdgePercent) / chance) * 100) / 100,
    [chance, config.houseEdgePercent]
  );
  const possiblePayout = Math.floor(bet * multiplier);
  const profitableWin = possiblePayout > bet;
  const sliderFill = ((target - minTarget) / Math.max(1, maxTarget - minTarget)) * 100;
  const activeRoll = result?.roll ?? target;

  // One continuous ball from first motion until the server result is reached.
  // The final number is used for the destination, never for the moving ball color.
  useEffect(() => {
    if (!rolling) return undefined;
    const motion = motionRef.current;
    if (!motion) return undefined;
    let active = true;
    const tick = (now) => {
      if (!active) return;
      const elapsed = motion.lastAt ? Math.min(50, now - motion.lastAt) : 0;
      motion.lastAt = now;
      if (motion.braking) {
        const { from, to, at, duration } = motion.braking;
        const t = clamp((now - at) / duration, 0, 1);
        motion.virtual = from + (to - from) * (1 - Math.pow(1 - t, 2.1));
      } else {
        motion.virtual += Math.max(0, elapsed) * CRUISE_SPEED;
      }
      const position = reflectTrackPosition(motion.virtual);
      if (ballRef.current) {
        ballRef.current.style.left = position + '%';
        ballRef.current.style.setProperty('--spin', (motion.virtual * 3.8) + 'deg');
      }
      if (motion.braking && now >= motion.braking.at + motion.braking.duration) {
        const complete = motion.braking.resolve;
        motion.braking = null;
        window.clearTimeout(motion.fallback);
        motion.fallback = null;
        complete();
        return;
      }
      motion.frame = window.requestAnimationFrame(tick);
    };
    motion.frame = window.requestAnimationFrame(tick);
    return () => {
      active = false;
      window.cancelAnimationFrame(motion.frame);
      if (motion.fallback) window.clearTimeout(motion.fallback);
      motionRef.current = null;
    };
  }, [rolling]);

  const waitForSettlingAnimation = useCallback((durationMs, rollValue) => {
    const motion = motionRef.current;
    if (!motion || window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      return Promise.resolve();
    }
    const duration = clamp(Number(durationMs) || 1400, 800, 2400);
    const roll = clamp(Number(rollValue) || 0, 0, 99.99);
    return new Promise((resolve) => {
      const to = brakingDestination(motion.virtual, roll, duration);
      let completed = false;
      const finish = () => {
        if (completed) return;
        completed = true;
        motion.virtual = to;
        motion.braking = null;
        if (ballRef.current) ballRef.current.style.left = roll + '%';
        resolve();
      };
      motion.braking = {
        from: motion.virtual, to, at: performance.now(), duration, resolve: finish,
      };
      // Browsers pause requestAnimationFrame in background tabs.
      motion.fallback = window.setTimeout(finish, duration + 550);
    });
  }, []);

  useEffect(() => () => {
    onRoundStateChange?.(false);
    const motion = motionRef.current;
    if (motion?.frame) window.cancelAnimationFrame(motion.frame);
    if (motion?.fallback) window.clearTimeout(motion.fallback);
    motionRef.current = null;
  }, [onRoundStateChange]);

  useEffect(() => {
    let cancelled = false;

    apiPost('/api/dice', { action: 'state' })
      .then((data) => {
        if (cancelled) return;
        if (data?.config) setConfig({ ...DEFAULT_CONFIG, ...data.config });
        if (Array.isArray(data?.recent)) setRecent(data.recent);
        if (Number.isFinite(Number(data?.balance))) onBalanceChange?.(data.balance);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [apiPost, onBalanceChange]);

  useEffect(() => {
    setTarget((current) => clamp(current, minTarget, maxTarget));
    setBet((current) => clamp(
      current,
      config.minBet,
      Math.max(config.minBet, Math.min(config.maxBet, Math.max(config.minBet, balance)))
    ));
  }, [balance, config.maxBet, config.minBet, maxTarget, minTarget]);

  const changeMode = useCallback((nextMode) => {
    if (rolling) return;
    setMode(nextMode);
    const nextMin = nextMode === 'higher' ? 100 - config.maxWinChance : config.minWinChance;
    const nextMax = nextMode === 'higher' ? 100 - config.minWinChance : config.maxWinChance;
    setTarget((current) => clamp(current, nextMin, nextMax));
    setResult(null);
    setLocalError('');
    tg?.HapticFeedback?.selectionChanged?.();
  }, [config.maxWinChance, config.minWinChance, rolling, tg]);

  const updateBet = useCallback((value) => {
    setBet(clamp(
      safeInteger(value, config.minBet),
      config.minBet,
      Math.max(config.minBet, Math.min(config.maxBet, Math.max(config.minBet, balance)))
    ));
    setLocalError('');
  }, [balance, config.maxBet, config.minBet]);

  const play = useCallback(async () => {
    if (rolling) return;

    const normalizedBet = clamp(safeInteger(bet, config.minBet), config.minBet, config.maxBet);
    if (Math.floor(normalizedBet * multiplier) <= normalizedBet) {
      setLocalError('Ushbu stavka va ehtimolda yutuq qo‘shimcha Stars bermaydi. Stavkani oshiring yoki ehtimolni kamaytiring.');
      return;
    }
    if (normalizedBet > balance) {
      setLocalError('Balans yetarli emas. Stavkani kamaytiring.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      return;
    }

    setBet(normalizedBet);
    setRolling(true);
    setSettling(false);
    motionRef.current = { virtual: Number(result?.roll ?? 50), lastAt: 0, frame: null, braking: null, fallback: null };
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
      const nextConfig = { ...config, ...(data?.config || {}) };
      setConfig(nextConfig);
      const waitMs = Math.max(0, 480 - (Date.now() - startedAt));
      if (waitMs) await new Promise((resolve) => window.setTimeout(resolve, waitMs));

      const nextResult = data?.result;
      if (!nextResult) throw new Error('Dice natijasi olinmadi.');

      setSettling(true);
      await waitForSettlingAnimation(nextConfig.rollDurationMs, nextResult.roll);

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
      setSettling(false);
      setRolling(false);
      onRoundStateChange?.(false);
    }
  }, [apiPost, balance, bet, config, mode, onBalanceChange, onRoundStateChange, onToast, result, rolling, target, tg, waitForSettlingAnimation]);

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
        )) : <span>Hozircha raundlar yo‘q</span>}
      </div>

      <section className={styles.arena}>
        <div className={styles.arenaTop}>
          <div><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>
          <div className={styles.scaleTicks} aria-hidden="true" />
        </div>

        <div className={styles.trackWrap} data-mode={mode} style={{ '--target': `${target}%`, '--roll': `${activeRoll}%`, '--settle-duration': `${config.rollDurationMs}ms` }}>
          <div className={styles.track} />
          <span className={styles.targetMarker}><b>{target}</b></span>
          {result && !rolling ? <span className={styles.rollMarker} data-win={result.won ? 'true' : 'false'}><i>{Number(result.roll).toFixed(2)}</i></span> : null}
          {rolling ? (
            <span ref={ballRef} className={styles.movingMarker} style={{ left: `${reflectTrackPosition(motionRef.current?.virtual ?? 50)}%` }} aria-hidden="true"><i /></span>
          ) : null}
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={target}
            disabled={rolling}
            aria-label="Dice chegarasi"
            aria-valuemin={minTarget}
            aria-valuemax={maxTarget}
            style={{ '--fill': `${sliderFill}%` }}
            onChange={(event) => {
              setTarget(clamp(Number(event.target.value), minTarget, maxTarget));
              setResult(null);
              setLocalError('');
            }}
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
          <button type="button" onClick={() => updateBet(bet - 1)} disabled={rolling || bet <= config.minBet}>−</button>
          <label>{starIcon(styles.betStar)}<input type="number" min={config.minBet} max={Math.min(config.maxBet, Math.max(config.minBet, balance))} value={bet} disabled={rolling} onChange={(event) => updateBet(event.target.value)} /></label>
          <button type="button" onClick={() => updateBet(bet + 1)} disabled={rolling || bet >= balance}>+</button>
        </div>
        <div className={styles.quickBets}>
          {QUICK_BETS.map((amount) => <button key={amount} type="button" onClick={() => updateBet(amount)} disabled={rolling || amount > balance || amount < config.minBet}>{amount}</button>)}
          <button type="button" onClick={() => updateBet(Math.min(balance, config.maxBet))} disabled={rolling || balance < config.minBet}>MAX</button>
        </div>
        {!profitableWin && !rolling ? <p className={styles.error}>Bu shartlarda yutuq foyda bermaydi. Stavka yoki ehtimolni o‘zgartiring.</p> : null}
        {localError ? <p className={styles.error}>{localError}</p> : null}
        <button type="button" className={styles.playButton} onClick={play} disabled={rolling || !config.enabled || balance < config.minBet || !profitableWin}>
          {!config.enabled ? 'O‘YIN VAQTINCHA O‘CHIRILGAN' : rolling ? <><span className={styles.buttonDice} /> {settling ? 'SEKINLASHMOQDA...' : 'NATIJA ANIQLANMOQDA...'}</> : <>{starIcon(styles.buttonStar)} {formatStars(bet)} STARS BILAN O‘YNASH</>}
        </button>
      </section>
    </section>
  );
}
