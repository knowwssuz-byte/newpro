'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import styles from './RocketGame.module.css';

const DEFAULT_CONFIG = {
  minBet: 1,
  maxBet: 10000,
  minAutoCashout: 1.1,
  maxAutoCashout: 100,
  growthRate: 0.1,
  pollIntervalMs: 350,
  houseEdgePercent: 4,
};

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatStars(value) {
  return new Intl.NumberFormat('uz-UZ', {
    maximumFractionDigits: 0,
  }).format(Math.max(0, Math.floor(toNumber(value))));
}

function formatMultiplier(value) {
  return `${Math.max(1, toNumber(value, 1)).toFixed(2)}×`;
}

function normalizeRound(value) {
  if (!value?.id) return null;

  return {
    id: String(value.id),
    status: String(value.status || 'running'),
    bet: Math.max(0, toNumber(value.bet)),
    payout: Math.max(0, toNumber(value.payout)),
    autoCashout:
      value.autoCashout == null && value.auto_cashout == null
        ? null
        : toNumber(value.autoCashout ?? value.auto_cashout),
    currentMultiplier: Math.max(
      1,
      toNumber(value.currentMultiplier ?? value.current_multiplier, 1)
    ),
    cashoutMultiplier:
      value.cashoutMultiplier == null && value.cashout_multiplier == null
        ? null
        : toNumber(value.cashoutMultiplier ?? value.cashout_multiplier),
    crashMultiplier:
      value.crashMultiplier == null && value.crash_multiplier == null
        ? null
        : toNumber(value.crashMultiplier ?? value.crash_multiplier),
    serverSeedHash:
      value.serverSeedHash || value.server_seed_hash || '',
    serverSeed: value.serverSeed || value.server_seed || '',
    startedAt: value.startedAt || value.started_at || null,
    settledAt: value.settledAt || value.settled_at || null,
  };
}

function statusLabel(status) {
  if (status === 'running') return 'FLYING';
  if (status === 'cashed_out') return 'CASHED OUT';
  if (status === 'crashed') return 'CRASHED';
  return 'READY';
}

function RocketMark({ className = '' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M14.3 4.1c2.6-.9 5.4-.5 5.4-.5s.4 2.8-.5 5.4c-.8 2.2-2.8 4.6-5.7 7l-5.4-5.4c2.4-2.9 4.8-4.9 6.2-6.5Z"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path
        d="m9.2 15.1-3 2.8-.7-3.3-2.8-.9 2.9-2.8m7.8 5.2-2.7 2.8-.9-2.8-3.3-.7 2.8-2.9"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="15.8" cy="7.5" r="1.55" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function shortHash(value) {
  const text = String(value || '');
  if (text.length <= 20) return text || '—';
  return `${text.slice(0, 10)}…${text.slice(-8)}`;
}

function outcomeMultiplier(round) {
  if (!round) return 1;
  if (round.status === 'cashed_out') {
    return round.cashoutMultiplier || round.currentMultiplier || 1;
  }
  if (round.status === 'crashed') {
    return round.crashMultiplier || round.currentMultiplier || 1;
  }
  return round.currentMultiplier || 1;
}

async function verifySettledRound(round) {
  if (
    !round?.serverSeed ||
    !round?.serverSeedHash ||
    round?.crashMultiplier == null
  ) {
    return 'unavailable';
  }

  try {
    const seedBytes = new TextEncoder().encode(round.serverSeed);
    const digest = await window.crypto.subtle.digest('SHA-256', seedBytes);
    const digestHex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const randomInt = BigInt(`0x${round.serverSeed.slice(0, 13)}`);
    const denominator = 4503599627370497n;
    const rawCrashCents =
      (96n * denominator) / (randomInt + 1n);
    const crashCents =
      rawCrashCents < 100n
        ? 100n
        : rawCrashCents > 100000n
          ? 100000n
          : rawCrashCents;
    const calculatedCrash = Number(crashCents) / 100;

    return digestHex === round.serverSeedHash &&
      Math.abs(calculatedCrash - round.crashMultiplier) < 0.001
      ? 'verified'
      : 'failed';
  } catch {
    return 'unavailable';
  }
}

export default function RocketGame({
  apiPost,
  profile,
  tg,
  onBack,
  onBalanceChange,
  onRoundStateChange,
  onToast,
}) {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [round, setRound] = useState(null);
  const [history, setHistory] = useState([]);
  const [bet, setBet] = useState('10');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoCashout, setAutoCashout] = useState('2.00');
  const [displayMultiplier, setDisplayMultiplier] = useState(1);
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [verification, setVerification] = useState('pending');

  const mountedRef = useRef(false);
  const pollBusyRef = useRef(false);
  const pollFailuresRef = useRef(0);
  const clockOffsetRef = useRef(0);
  const animationFrameRef = useRef(null);
  const lastPaintRef = useRef(0);

  const isRunning = round?.status === 'running';
  const balance = Math.max(0, toNumber(profile?.balance));
  const numericBet = Math.max(0, Math.floor(toNumber(bet)));
  const possiblePayout = Math.max(
    numericBet,
    Math.floor(numericBet * displayMultiplier)
  );

  const applyPayload = useCallback(
    (data, { keepFinishedRound = true } = {}) => {
      if (!data || !mountedRef.current) return;

      if (data.config) {
        setConfig((current) => ({
          ...current,
          ...data.config,
        }));
      }

      if (Array.isArray(data.history)) {
        setHistory(data.history.map(normalizeRound).filter(Boolean));
      }

      if (data.serverTime) {
        const serverTimestamp = new Date(data.serverTime).getTime();
        if (Number.isFinite(serverTimestamp)) {
          clockOffsetRef.current = serverTimestamp - Date.now();
        }
      }

      const nextRound = normalizeRound(data.round);

      if (nextRound) {
        setRound(nextRound);

        if (nextRound.status === 'running') {
          setDisplayMultiplier((current) =>
            Math.max(1, nextRound.currentMultiplier, current)
          );
        } else {
          setDisplayMultiplier(outcomeMultiplier(nextRound));
        }

        onRoundStateChange?.(nextRound.status === 'running');
      } else if (!keepFinishedRound) {
        setRound(null);
        setDisplayMultiplier(1);
        onRoundStateChange?.(false);
      }

      if (data.balance != null) {
        onBalanceChange?.(data.balance);
      }
    },
    [onBalanceChange, onRoundStateChange]
  );

  const loadState = useCallback(async () => {
    setLocalError('');

    try {
      const data = await apiPost('/api/rocket', { action: 'state' });
      applyPayload(data, { keepFinishedRound: false });
    } catch (error) {
      if (mountedRef.current) {
        setLocalError(error?.message || 'Rocket ma’lumotlarini yuklab bo‘lmadi.');
      }
    } finally {
      if (mountedRef.current) {
        setInitializing(false);
      }
    }
  }, [apiPost, applyPayload]);

  useEffect(() => {
    mountedRef.current = true;
    loadState();

    return () => {
      mountedRef.current = false;
      onRoundStateChange?.(false);

      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [loadState, onRoundStateChange]);

  useEffect(() => {
    if (!isRunning || !round?.startedAt) {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      return undefined;
    }

    const startedAt = new Date(round.startedAt).getTime();
    const growthRate = clamp(
      toNumber(config.growthRate, DEFAULT_CONFIG.growthRate),
      0.02,
      0.3
    );

    const animate = (timestamp) => {
      if (!mountedRef.current) return;

      if (timestamp - lastPaintRef.current >= 34) {
        const serverNow = Date.now() + clockOffsetRef.current;
        const elapsedSeconds = Math.max(0, (serverNow - startedAt) / 1000);
        const calculated = Math.floor(Math.exp(elapsedSeconds * growthRate) * 100) / 100;

        setDisplayMultiplier((current) =>
          Math.max(current, clamp(calculated, 1, 999.99))
        );
        lastPaintRef.current = timestamp;
      }

      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [config.growthRate, isRunning, round?.startedAt]);

  useEffect(() => {
    if (!isRunning || !round?.id) return undefined;

    let stopped = false;
    const intervalMs = clamp(
      Math.floor(toNumber(config.pollIntervalMs, DEFAULT_CONFIG.pollIntervalMs)),
      250,
      1000
    );

    const poll = async () => {
      if (stopped || pollBusyRef.current) return;
      pollBusyRef.current = true;

      try {
        const data = await apiPost('/api/rocket', {
          action: 'state',
          roundId: round.id,
        });

        pollFailuresRef.current = 0;
        applyPayload(data);
      } catch (error) {
        pollFailuresRef.current += 1;

        if (pollFailuresRef.current >= 3 && mountedRef.current) {
          setLocalError(
            error?.message ||
              'Server bilan aloqa uzildi. Natija serverda xavfsiz saqlanadi.'
          );
        }
      } finally {
        pollBusyRef.current = false;
      }
    };

    const timer = window.setInterval(poll, intervalMs);
    poll();

    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [apiPost, applyPayload, config.pollIntervalMs, isRunning, round?.id]);

  useEffect(() => {
    if (!round || round.status === 'running') return;

    onRoundStateChange?.(false);

    if (round.status === 'crashed') {
      tg?.HapticFeedback?.notificationOccurred?.('error');
    }

    if (round.status === 'cashed_out') {
      tg?.HapticFeedback?.notificationOccurred?.('success');
    }
  }, [onRoundStateChange, round, tg]);

  useEffect(() => {
    let cancelled = false;

    if (!round || round.status === 'running') {
      setVerification('pending');
      return undefined;
    }

    verifySettledRound(round).then((result) => {
      if (!cancelled && mountedRef.current) {
        setVerification(result);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [round]);

  const setSafeBet = (value) => {
    if (isRunning || submitting) return;

    const minBet = Math.max(1, Math.floor(toNumber(config.minBet, 1)));
    const maxBet = Math.max(
      minBet,
      Math.floor(toNumber(config.maxBet, DEFAULT_CONFIG.maxBet))
    );
    const next = clamp(Math.floor(toNumber(value, minBet)), minBet, maxBet);
    setBet(String(next));
  };

  const validateBet = () => {
    const minBet = Math.max(1, Math.floor(toNumber(config.minBet, 1)));
    const maxBet = Math.max(
      minBet,
      Math.floor(toNumber(config.maxBet, DEFAULT_CONFIG.maxBet))
    );

    if (!Number.isInteger(numericBet) || numericBet < minBet || numericBet > maxBet) {
      throw new Error(`Stavka ${minBet}–${formatStars(maxBet)} oralig‘ida bo‘lishi kerak.`);
    }

    if (numericBet > balance) {
      throw new Error('Balans yetarli emas.');
    }

    if (autoEnabled) {
      const autoValue = toNumber(autoCashout);
      const minAuto = toNumber(config.minAutoCashout, 1.1);
      const maxAuto = toNumber(config.maxAutoCashout, 100);

      if (autoValue < minAuto || autoValue > maxAuto) {
        throw new Error(
          `Auto cashout ${minAuto.toFixed(2)}×–${maxAuto.toFixed(2)}× oralig‘ida bo‘lishi kerak.`
        );
      }
    }
  };

  const launch = async () => {
    if (isRunning || submitting) return;

    setLocalError('');

    try {
      validateBet();
      setSubmitting(true);
      setDisplayMultiplier(1);
      tg?.HapticFeedback?.impactOccurred?.('medium');

      const data = await apiPost('/api/rocket', {
        action: 'start',
        bet: numericBet,
        autoCashout: autoEnabled ? Number(toNumber(autoCashout).toFixed(2)) : null,
      });

      applyPayload(data);
      onToast?.('Rocket uchdi 🚀');
    } catch (error) {
      setLocalError(error?.message || 'Raundni boshlashda xatolik.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const cashOut = async () => {
    if (!isRunning || !round?.id || submitting) return;

    setLocalError('');
    setSubmitting(true);
    tg?.HapticFeedback?.impactOccurred?.('heavy');

    try {
      const data = await apiPost('/api/rocket', {
        action: 'cashout',
        roundId: round.id,
      });

      applyPayload(data);

      const settledRound = normalizeRound(data.round);
      if (settledRound?.status === 'cashed_out') {
        onToast?.(`Yutuq: ${formatStars(settledRound.payout)} ⭐`);
      } else if (settledRound?.status === 'crashed') {
        onToast?.(`Raketa ${formatMultiplier(settledRound.crashMultiplier)} da portladi`);
      }
    } catch (error) {
      setLocalError(error?.message || 'Cash out bajarilmadi.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const handlePrimaryAction = () => {
    if (isRunning) {
      cashOut();
      return;
    }

    launch();
  };

  const handleBack = () => {
    if (isRunning) {
      onToast?.('Raund tugaguncha o‘yindan chiqib bo‘lmaydi.');
      tg?.HapticFeedback?.notificationOccurred?.('warning');
      return;
    }

    onBack?.();
  };

  const visualProgress = useMemo(() => {
    const normalized = Math.log(Math.max(1, displayMultiplier)) / Math.log(8);
    return clamp(normalized, 0, 1);
  }, [displayMultiplier]);

  const flightStyle = {
    '--rocket-x': `${13 + visualProgress * 66}%`,
    '--rocket-y': `${76 - visualProgress * 55}%`,
    '--trail-size': `${64 + visualProgress * 42}px`,
  };

  const primaryClass = [
    styles.primaryAction,
    isRunning ? styles.cashoutAction : styles.launchAction,
    round?.status === 'crashed' ? styles.afterCrash : '',
  ]
    .filter(Boolean)
    .join(' ');

  const resultText =
    round?.status === 'cashed_out'
      ? `+${formatStars(round.payout)} ⭐ balansga qo‘shildi`
      : round?.status === 'crashed'
        ? `${formatStars(round.bet)} ⭐ stavka yutqazildi`
        : '';

  return (
    <section className={styles.root}>
      <header className={styles.gameHeader}>
      <button
          type="button"
          className={styles.backButton}
          onClick={handleBack}
          aria-label="Rocket o‘yinidan chiqish"
        >
          <span aria-hidden="true">‹</span>
          <strong>Games</strong>
        </button>

        <div className={styles.titleBlock}>
          <span>CRASH GAME</span>
          <h1>ROCKET</h1>
        </div>

        <div className={styles.liveBadge}>
          <i />
          LIVE
        </div>
      </header>

      <div
        className={`${styles.flightPanel} ${
          round?.status === 'crashed' ? styles.crashedPanel : ''
        } ${round?.status === 'cashed_out' ? styles.wonPanel : ''}`}
      >
        <div className={styles.spaceGlow} aria-hidden="true" />
        <div className={styles.grid} aria-hidden="true" />
        <div className={styles.stars} aria-hidden="true">
          {Array.from({ length: 18 }, (_, index) => (
            <i key={index} />
          ))}
        </div>

        <div className={styles.flightTopline}>
          <span className={styles.statusPill}>
            <i />
            {initializing ? 'SYNCING' : statusLabel(round?.status)}
          </span>
          <span className={styles.fairPill}>PROVABLY FAIR</span>
        </div>

        <div className={styles.multiplierWrap}>
          <strong>{formatMultiplier(displayMultiplier)}</strong>
          <span>
            {isRunning
              ? 'Raketa uchmoqda'
              : round?.status === 'crashed'
                ? 'Raketa portladi'
                : round?.status === 'cashed_out'
                  ? 'Yutuq olindi'
                  : 'Uchishga tayyor'}
          </span>
        </div>

        <div className={styles.curve} aria-hidden="true">
          <svg viewBox="0 0 420 190" preserveAspectRatio="none">
            <path className={styles.curveShadow} d="M10 176 C 112 174, 205 160, 270 118 S 356 38, 410 14" />
            <path className={styles.curveLine} d="M10 176 C 112 174, 205 160, 270 118 S 356 38, 410 14" />
          </svg>
        </div>

        <div className={styles.rocketFlight} style={flightStyle} aria-hidden="true">
          <span className={styles.rocketTrail} />
          <Image
            src="/feature/rocket.webp"
            alt=""
            width={512}
            height={512}
            unoptimized
            priority
            draggable="false"
          />
          <span className={styles.explosion}>
            <i />
            <i />
            <i />
          </span>
        </div>

        {resultText ? <div className={styles.resultBanner}>{resultText}</div> : null}
      </div>

      {localError ? (
        <div className={styles.errorBox} role="alert">
          <span>{localError}</span>
          <button type="button" onClick={() => setLocalError('')} aria-label="Xatoni yopish">
            ×
          </button>
        </div>
      ) : null}

      <div className={styles.controlCard}>
        <div className={styles.controlHeading}>
          <div>
            <span>BET AMOUNT</span>
            <strong>Stavkani tanlang</strong>
          </div>
          <span className={styles.balanceHint}>
            Balance <b>{formatStars(balance)} ⭐</b>
          </span>
        </div>

        <div className={styles.betInputRow}>
          <button
            type="button"
            className={styles.adjustButton}
            disabled={isRunning || submitting}
            onClick={() => setSafeBet(Math.max(1, Math.floor(numericBet / 2)))}
          >
            ½
          </button>

          <label className={styles.betField}>
            <input
              type="number"
              inputMode="numeric"
              min={config.minBet}
              max={config.maxBet}
              step="1"
              value={bet}
              disabled={isRunning || submitting}
              onChange={(event) => setBet(event.target.value.replace(/[^\d]/g, ''))}
              onBlur={() => setSafeBet(bet)}
              aria-label="Rocket stavkasi"
            />
            <span>⭐</span>
          </label>

          <button
            type="button"
            className={styles.adjustButton}
            disabled={isRunning || submitting}
            onClick={() => setSafeBet(numericBet * 2)}
          >
            2×
          </button>
        </div>

        <div className={styles.quickBets}>
          {[10, 25, 50, 100].map((value) => (
            <button
              type="button"
              key={value}
              className={numericBet === value ? styles.quickBetActive : ''}
              disabled={isRunning || submitting}
              onClick={() => setSafeBet(value)}
            >
              {value}
            </button>
          ))}
          <button
            type="button"
            disabled={isRunning || submitting || balance < 1}
            onClick={() => setSafeBet(Math.min(balance, config.maxBet))}
          >
            MAX
          </button>
        </div>

        <div className={styles.autoRow}>
          <button
            type="button"
            role="switch"
            aria-checked={autoEnabled}
            className={`${styles.switch} ${autoEnabled ? styles.switchOn : ''}`}
            disabled={isRunning || submitting}
            onClick={() => setAutoEnabled((current) => !current)}
          >
            <i />
          </button>

          <div className={styles.autoCopy}>
            <strong>Auto cashout</strong>
            <span>Belgilangan koeffitsiyentda avtomatik oladi</span>
          </div>

          <label className={styles.autoField}>
            <input
              type="number"
              inputMode="decimal"
              min={config.minAutoCashout}
              max={config.maxAutoCashout}
              step="0.05"
              value={autoCashout}
              disabled={!autoEnabled || isRunning || submitting}
              onChange={(event) => setAutoCashout(event.target.value)}
              aria-label="Auto cashout koeffitsiyenti"
            />
            <span>×</span>
          </label>
        </div>

        <button
          type="button"
          className={primaryClass}
          disabled={initializing || submitting || (!isRunning && balance < 1)}
          onClick={handlePrimaryAction}
        >
          <span className={styles.primaryIcon} aria-hidden="true">
            {isRunning ? '↙' : <RocketMark />}
          </span>
          <span className={styles.primaryCopy}>
            <strong>
              {submitting
                ? 'PLEASE WAIT'
                : isRunning
                  ? `CASH OUT ${formatStars(possiblePayout)} ⭐`
                  : 'BET & LAUNCH'}
            </strong>
            <small>
              {isRunning
                ? `Current ${formatMultiplier(displayMultiplier)}`
                : `${formatStars(numericBet)} ⭐ bilan boshlash`}
            </small>
          </span>
        </button>
      </div>

      <div className={styles.fairnessCard}>
        <div>
          <span>ROUND VERIFICATION</span>
          <strong>
            {verification === 'verified'
              ? 'Seed va crash point tekshirildi'
              : verification === 'failed'
                ? 'Verification mos kelmadi'
                : round?.serverSeedHash
                  ? shortHash(round.serverSeedHash)
                  : 'Har raund uchun yangi hash'}
          </strong>
        </div>
        <span
          className={`${styles.shieldIcon} ${
            verification === 'failed' ? styles.shieldFailed : ''
          }`}
          aria-hidden="true"
        >
          {verification === 'failed' ? '!' : '✓'}
        </span>
      </div>

      {round?.status !== 'running' && round?.serverSeed ? (
        <details className={styles.fairnessDetails}>
          <summary>Fairness details</summary>
          <div>
            <span>Server seed</span>
            <code>{round.serverSeed}</code>
          </div>
          <div>
            <span>SHA-256 hash</span>
            <code>{round.serverSeedHash}</code>
          </div>
          <div>
            <span>Crash point</span>
            <strong>{formatMultiplier(round.crashMultiplier)}</strong>
          </div>
        </details>
      ) : null}

      <section className={styles.historyCard}>
        <div className={styles.historyHead}>
          <div>
            <span>YOUR ACTIVITY</span>
            <h2>Recent rounds</h2>
          </div>
          <button type="button" onClick={loadState} disabled={initializing || submitting}>
            Refresh
          </button>
        </div>

        {history.length ? (
          <div className={styles.historyList}>
            {history.slice(0, 8).map((item) => {
              const won = item.status === 'cashed_out';
              const multiplier = won
                ? item.cashoutMultiplier
                : item.crashMultiplier;

              return (
                <div className={styles.historyRow} key={item.id}>
                  <span className={`${styles.historyOutcome} ${won ? styles.historyWon : styles.historyLost}`}>
                    {won ? 'WIN' : 'CRASH'}
                  </span>
                  <div>
                    <strong>{formatStars(item.bet)} ⭐</strong>
                    <span>{item.startedAt ? new Date(item.startedAt).toLocaleString('uz-UZ') : '—'}</span>
                  </div>
                  <div className={styles.historyResult}>
                    <strong>{formatMultiplier(multiplier)}</strong>
                    <span>{won ? `+${formatStars(item.payout)} ⭐` : `−${formatStars(item.bet)} ⭐`}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyHistory}>
            <RocketMark className={styles.emptyRocketIcon} />
            <strong>Hali raund yo‘q</strong>
            <p>Birinchi stavkangiz shu yerda ko‘rinadi.</p>
          </div>
        )}
      </section>

      <p className={styles.disclaimer}>
        Natija serverda aniqlanadi. Cash out faqat server tasdiqlagandan keyin balansga qo‘shiladi.
      </p>
    </section>
  );
}
