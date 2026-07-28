'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import styles from './RocketGame.module.css';

const DEFAULT_CONFIG = {
  minBet: 1,
  maxBet: 10000,
  minAutoCashout: 1.1,
  maxAutoCashout: 100,
  bettingWindowMs: 7000,
  resultHoldMs: 1400,
  growthRate: 0.22,
  pollIntervalMs: 300,
  houseEdgePercent: 4,
};

const QUICK_BETS = [10, 25, 50, 100];
const PARTICLES = [
  [7, 18, 5],
  [17, 43, 3],
  [28, 25, 4],
  [39, 57, 3],
  [52, 16, 4],
  [63, 38, 5],
  [74, 20, 3],
  [86, 49, 4],
  [94, 27, 3],
  [11, 72, 4],
  [24, 84, 3],
  [44, 76, 4],
  [59, 88, 3],
  [78, 70, 5],
  [91, 82, 3],
];
const EXPLOSION_SPARKS = [
  [4, 92, 0],
  [28, 74, 35],
  [51, 98, 12],
  [78, 70, 48],
  [106, 89, 22],
  [133, 76, 55],
  [158, 101, 8],
  [184, 82, 42],
  [211, 94, 18],
  [238, 73, 62],
  [264, 102, 28],
  [291, 79, 50],
  [316, 91, 15],
  [341, 72, 38],
];
const EXPLOSION_DEBRIS = [
  [19, 62, 0],
  [67, 51, 55],
  [112, 68, 20],
  [154, 55, 80],
  [202, 66, 35],
  [247, 52, 70],
  [293, 64, 15],
  [334, 50, 48],
];
const EXPLOSION_SMOKE = [
  [-35, -28, 0],
  [5, -40, 45],
  [38, -24, 80],
  [-44, 8, 95],
  [43, 12, 120],
  [-24, 38, 150],
  [22, 42, 175],
];

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
  return `${Math.max(1, toNumber(value, 1)).toFixed(2)}x`;
}

function normalizeRound(value) {
  if (!value?.id) return null;

  return {
    id: String(value.id),
    number: Math.max(0, Math.floor(toNumber(value.number ?? value.round_no))),
    status: String(value.status || 'betting'),
    currentMultiplier: Math.max(
      1,
      toNumber(value.currentMultiplier ?? value.current_multiplier, 1)
    ),
    crashMultiplier:
      value.crashMultiplier == null && value.crash_multiplier == null
        ? null
        : toNumber(value.crashMultiplier ?? value.crash_multiplier),
    serverSeedHash: String(
      value.serverSeedHash || value.server_seed_hash || ''
    ),
    serverSeed: String(value.serverSeed || value.server_seed || ''),
    bettingOpensAt:
      value.bettingOpensAt || value.betting_opens_at || null,
    startsAt: value.startsAt || value.starts_at || null,
    settledAt: value.settledAt || value.settled_at || null,
  };
}

function normalizeBet(value) {
  if (!value?.id) return null;

  return {
    id: String(value.id),
    roundId: String(value.roundId || value.round_id || ''),
    status: String(value.status || 'placed'),
    bet: Math.max(0, Math.floor(toNumber(value.bet))),
    payout: Math.max(0, Math.floor(toNumber(value.payout))),
    autoCashout:
      value.autoCashout == null && value.auto_cashout == null
        ? null
        : toNumber(value.autoCashout ?? value.auto_cashout),
    cashoutMultiplier:
      value.cashoutMultiplier == null &&
      value.cashout_multiplier == null
        ? null
        : toNumber(
            value.cashoutMultiplier ?? value.cashout_multiplier
          ),
  };
}

function authoritativeMultiplier(round) {
  if (!round) return 1;

  if (round.status === 'crashed') {
    return Math.max(1, toNumber(round.crashMultiplier, 1));
  }

  return round.status === 'flying'
    ? clamp(toNumber(round.currentMultiplier, 1), 1, 999.99)
    : 1;
}

function useVisualMultiplier(round) {
  const target = authoritativeMultiplier(round);
  const [visualMultiplier, setVisualMultiplier] = useState(target);
  const visualRef = useRef(target);
  const roundIdRef = useRef(round?.id || '');
  const frameRef = useRef(null);

  useEffect(() => {
    if (frameRef.current) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }

    const roundId = round?.id || '';
    const isNewRound = roundIdRef.current !== roundId;
    roundIdRef.current = roundId;

    if (isNewRound || !round || round.status === 'betting') {
      const nextValue = round?.status === 'flying' ? target : 1;
      visualRef.current = nextValue;
      setVisualMultiplier(nextValue);
      return undefined;
    }

    if (round.status === 'crashed') {
      visualRef.current = target;
      setVisualMultiplier(target);
      return undefined;
    }

    const from = visualRef.current;
    const to = Math.max(from, target);

    if (to - from < 0.005) {
      return undefined;
    }

    const startedAt = window.performance.now();
    const duration = 150;

    const animate = (now) => {
      const progress = clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.min(
        to,
        Math.floor((from + (to - from) * eased) * 100) / 100
      );

      if (nextValue !== visualRef.current) {
        visualRef.current = nextValue;
        setVisualMultiplier(nextValue);
      }

      if (progress < 1) {
        frameRef.current = window.requestAnimationFrame(animate);
      } else {
        frameRef.current = null;
      }
    };

    frameRef.current = window.requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, [round, target]);

  return round?.status === 'crashed' ? target : visualMultiplier;
}

function historyTone(multiplier) {
  const value = toNumber(multiplier, 1);
  if (value < 1.2) return styles.historyRed;
  if (value < 2) return styles.historyGreen;
  if (value < 5) return styles.historyBlue;
  return styles.historyPurple;
}

function avatarHue(name) {
  const hash = Array.from(String(name || 'P')).reduce(
    (value, character) => (value * 31 + character.charCodeAt(0)) % 360,
    191
  );
  return hash;
}

function playerInitial(name) {
  return (
    String(name || 'P')
      .trim()
      .charAt(0)
      .toUpperCase() || 'P'
  );
}

function shortHash(value) {
  const text = String(value || '');
  if (!text) return '—';
  if (text.length <= 22) return text;
  return `${text.slice(0, 11)}…${text.slice(-8)}`;
}

async function verifySettledRound(round) {
  if (
    round?.status !== 'crashed' ||
    !round?.serverSeed ||
    !round?.serverSeedHash ||
    round?.crashMultiplier == null
  ) {
    return 'unavailable';
  }

  try {
    const bytes = new TextEncoder().encode(round.serverSeed);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const digestHex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const randomInt = BigInt(`0x${round.serverSeed.slice(0, 13)}`);
    const denominator = 4503599627370497n;
    const rawCrashCents = (96n * denominator) / (randomInt + 1n);
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

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15 5 8 12l7 7" />
    </svg>
  );
}

function SignalIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 9.5a10 10 0 0 1 14 0M8 13a5.8 5.8 0 0 1 8 0" />
      <circle cx="12" cy="17" r="1.2" />
    </svg>
  );
}

function StarCoin({ small = false }) {
  return (
    <span className={`${styles.coin} ${small ? styles.coinSmall : ''}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 4.2 2.2 4.5 5 .7-3.6 3.5.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.5 5-.7L12 4.2Z" />
      </svg>
    </span>
  );
}

function FlightScene({ round, config, serverNow }) {
  const startsAt = new Date(round?.startsAt || 0).getTime();
  const countdownMs = Number.isFinite(startsAt)
    ? Math.max(0, startsAt - serverNow)
    : 0;
  const visuallyFlying =
    round?.status === 'flying' ||
    (round?.status === 'betting' && countdownMs <= 0);
  const crashed = round?.status === 'crashed';
  const multiplier = useVisualMultiplier(round);
  const countdownSeconds = Math.max(0, countdownMs / 1000);
  const countdownProgress = clamp(
    countdownMs /
      Math.max(1, toNumber(config.bettingWindowMs, 7000)),
    0,
    1
  );

  const countdownStyle = {
    '--countdown-progress': `${countdownProgress * 360}deg`,
  };

  return (
    <div
      className={`${styles.flightScene} ${
        crashed ? styles.sceneCrashed : ''
      } ${visuallyFlying ? styles.sceneFlying : styles.sceneWaiting}`}
    >
      <div className={styles.sceneShade} aria-hidden="true" />
      <div className={styles.spaceFog} aria-hidden="true" />
      <div className={styles.orbitField} aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className={styles.particles} aria-hidden="true">
        {PARTICLES.map(([left, top, size], index) => (
          <i
            key={`${left}-${top}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}px`,
              height: `${size}px`,
              animationDelay: `${(index % 5) * -0.31}s`,
            }}
          />
        ))}
      </div>

      <div className={styles.sceneMeta}>
        <span>
          <i />
          {crashed
            ? 'ROUND ENDED'
            : visuallyFlying
              ? 'FLYING'
              : 'BETS OPEN'}
        </span>
        <b>#{round?.number || '—'}</b>
      </div>

      {!visuallyFlying && !crashed ? (
        <div className={styles.countdown} style={countdownStyle}>
          <div>
            <span>TAKE OFF IN</span>
            <strong>{countdownSeconds.toFixed(1)}</strong>
            <small>seconds</small>
          </div>
        </div>
      ) : (
        <div className={styles.liveMultiplier}>
          <strong>{formatMultiplier(multiplier)}</strong>
          <span>
            {crashed
              ? 'FINAL MULTIPLIER • CRASHED'
              : 'CASH OUT BEFORE THE BLAST'}
          </span>
        </div>
      )}

      <div className={styles.launchHalo} aria-hidden="true" />
      <div
        className={`${styles.rocket} ${
          crashed ? styles.rocketGone : ''
        }`}
        aria-hidden="true"
      >
        <span className={styles.engineGlow} />
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
      </div>

      {crashed ? (
        <div
          className={styles.explosion}
          key={`explosion-${round?.id || 'round'}`}
          aria-hidden="true"
        >
          <span className={styles.explosionFlash} />
          <span className={styles.explosionFireball} />
          <span className={styles.explosionCore} />
          <span className={styles.shockwave} />
          <span className={`${styles.shockwave} ${styles.shockwaveOuter}`} />
          <span className={styles.smokeCloud}>
            {EXPLOSION_SMOKE.map(([x, y, delay], index) => (
              <i
                key={`${x}-${y}`}
                style={{
                  '--smoke-x': `${x}px`,
                  '--smoke-y': `${y}px`,
                  '--smoke-delay': `${delay}ms`,
                  '--smoke-scale': `${0.82 + (index % 3) * 0.12}`,
                }}
              />
            ))}
          </span>
          <span className={styles.sparkField}>
            {EXPLOSION_SPARKS.map(([angle, distance, delay]) => (
              <i
                key={`${angle}-${distance}`}
                style={{
                  '--spark-angle': `${angle}deg`,
                  '--spark-distance': `${distance}px`,
                  '--spark-delay': `${delay}ms`,
                }}
              />
            ))}
          </span>
          <span className={styles.debrisField}>
            {EXPLOSION_DEBRIS.map(([angle, distance, delay], index) => (
              <i
                key={`${angle}-${distance}`}
                style={{
                  '--debris-angle': `${angle}deg`,
                  '--debris-distance': `${distance}px`,
                  '--debris-delay': `${delay}ms`,
                  '--debris-spin': `${index % 2 ? -310 : 350}deg`,
                }}
              />
            ))}
          </span>
        </div>
      ) : null}

      <div className={styles.floorGlow} aria-hidden="true" />
    </div>
  );
}

function PlayerRow({ player, liveMultiplier }) {
  const hue = avatarHue(player.name);
  const won = player.status === 'cashed_out';
  const lost = player.status === 'lost';
  const pendingPayout = Math.floor(
    Math.max(0, toNumber(player.bet)) * Math.max(1, liveMultiplier)
  );
  const value = won
    ? player.payout
    : lost
      ? 0
      : pendingPayout;

  return (
    <div
      className={`${styles.playerRow} ${
        player.isYou ? styles.playerYou : ''
      }`}
    >
      <span
        className={styles.avatar}
        style={{
          '--avatar-from': `hsl(${hue} 62% 62%)`,
          '--avatar-to': `hsl(${(hue + 34) % 360} 55% 38%)`,
        }}
      >
        {playerInitial(player.name)}
      </span>

      <div className={styles.playerInfo}>
        <strong>
          {player.name}
          {player.isYou ? <em>YOU</em> : null}
        </strong>
        <span>
          <StarCoin small />
          {formatStars(player.bet)}
          {player.autoCashout ? (
            <b>Auto {formatMultiplier(player.autoCashout)}</b>
          ) : null}
        </span>
      </div>

      <div
        className={`${styles.playerPayout} ${
          won
            ? styles.payoutWon
            : lost
              ? styles.payoutLost
              : styles.payoutLive
        }`}
      >
        <StarCoin small />
        <strong>{formatStars(value)}</strong>
        {won && player.cashoutMultiplier ? (
          <span>{formatMultiplier(player.cashoutMultiplier)}</span>
        ) : null}
      </div>
    </div>
  );
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
  const [myBet, setMyBet] = useState(null);
  const [history, setHistory] = useState([]);
  const [players, setPlayers] = useState([]);
  const [balance, setBalance] = useState(() =>
    Math.max(0, toNumber(profile?.balance))
  );
  const [bet, setBet] = useState('10');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoCashout, setAutoCashout] = useState('2.00');
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [uiNow, setUiNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [verification, setVerification] = useState('pending');

  const mountedRef = useRef(false);
  const actionBusyRef = useRef(false);
  const pollBusyRef = useRef(false);
  const phaseRef = useRef('betting');
  const hasClockSampleRef = useRef(false);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const pollFailuresRef = useRef(0);
  const lastSocialAtRef = useRef(0);
  const lastBetRef = useRef(null);
  const currentRoundIdRef = useRef(null);
  const errorUntilRef = useRef(0);

  const serverNow = uiNow + clockOffset;
  const startsAt = new Date(round?.startsAt || 0).getTime();
  const countdownMs = Number.isFinite(startsAt)
    ? Math.max(0, startsAt - serverNow)
    : 0;
  const phase =
    round?.status === 'betting' && countdownMs <= 0
      ? 'launching'
      : round?.status || 'betting';
  const liveMultiplier = authoritativeMultiplier(round);
  const numericBet = Math.max(0, Math.floor(toNumber(bet)));
  const activeBet =
    myBet?.roundId === round?.id && myBet?.status === 'placed';
  const possiblePayout = activeBet
    ? Math.floor(myBet.bet * liveMultiplier)
    : Math.floor(numericBet * liveMultiplier);
  const canEditBet = phase === 'betting' && !myBet && !submitting;

  useEffect(() => {
    setBalance(Math.max(0, toNumber(profile?.balance)));
  }, [profile?.balance]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setUiNow(Date.now());
    }, 100);

    return () => window.clearInterval(timer);
  }, []);

  const applyPayload = useCallback(
    (data, timing = {}) => {
      if (!mountedRef.current || !data) return;

      if (data.serverTime) {
        const serverTimestamp = new Date(data.serverTime).getTime();
        const midpoint =
          (toNumber(timing.sentAt, Date.now()) +
            toNumber(timing.receivedAt, Date.now())) /
          2;

        if (Number.isFinite(serverTimestamp)) {
          const sample = serverTimestamp - midpoint;
          setClockOffset((current) =>
            hasClockSampleRef.current
              ? current * 0.72 + sample * 0.28
              : sample
          );
          hasClockSampleRef.current = true;
        }
      }

      if (data.config) {
        setConfig((current) => ({ ...current, ...data.config }));
      }

      const nextRound = normalizeRound(data.round);
      const nextBet = normalizeBet(data.bet);
      const previousRoundId = lastBetRef.current?.roundId || null;
      const previousBetStatus = lastBetRef.current?.status || null;

      if (nextRound) {
        if (
          currentRoundIdRef.current &&
          currentRoundIdRef.current !== nextRound.id &&
          !Array.isArray(data.players)
        ) {
          setPlayers([]);
          lastSocialAtRef.current = 0;
        }

        currentRoundIdRef.current = nextRound.id;
        setRound(nextRound);
      }

      setMyBet(nextBet);
      lastBetRef.current = nextBet;

      if (
        previousRoundId &&
        previousRoundId === nextBet?.roundId &&
        previousBetStatus === 'placed' &&
        nextBet.status === 'cashed_out'
      ) {
        tg?.HapticFeedback?.notificationOccurred?.('success');
        onToast?.(`Yutuq: ${formatStars(nextBet.payout)} ⭐`);
      }

      if (
        previousRoundId &&
        previousRoundId === nextBet?.roundId &&
        previousBetStatus === 'placed' &&
        nextBet.status === 'lost'
      ) {
        tg?.HapticFeedback?.notificationOccurred?.('error');
        onToast?.(
          `Raketa ${formatMultiplier(nextRound?.crashMultiplier)} da portladi`
        );
      }

      if (Array.isArray(data.history)) {
        setHistory(data.history);
        lastSocialAtRef.current = Date.now();
      }

      if (Array.isArray(data.players)) {
        setPlayers(data.players);
        lastSocialAtRef.current = Date.now();
      }

      if (data.balance != null) {
        const nextBalance = Math.max(0, toNumber(data.balance));
        setBalance(nextBalance);
        onBalanceChange?.(nextBalance);
      }

      onRoundStateChange?.(nextBet?.status === 'placed');
      setConnection('live');
      if (Date.now() >= errorUntilRef.current) {
        setLocalError('');
      }
      setInitializing(false);
    },
    [onBalanceChange, onRoundStateChange, onToast, tg]
  );

  const callRocket = useCallback(
    async (body) => {
      const sequence = ++requestSequenceRef.current;
      const sentAt = Date.now();
      const data = await apiPost('/api/rocket', body);
      const receivedAt = Date.now();

      if (
        !mountedRef.current ||
        sequence < appliedSequenceRef.current
      ) {
        return null;
      }

      appliedSequenceRef.current = sequence;
      applyPayload(data, { sentAt, receivedAt });
      return data;
    },
    [apiPost, applyPayload]
  );

  useEffect(() => {
    mountedRef.current = true;
    let stopped = false;
    let timer = null;

    const poll = async () => {
      if (stopped) return;
      const cycleStartedAt = window.performance.now();

      if (!pollBusyRef.current && !actionBusyRef.current) {
        pollBusyRef.current = true;
        const includeSocial =
          Date.now() - lastSocialAtRef.current >= 1100;

        try {
          await callRocket({
            action: 'state',
            includeSocial,
          });
          pollFailuresRef.current = 0;
        } catch (error) {
          pollFailuresRef.current += 1;
          setConnection(
            navigator.onLine === false ? 'offline' : 'reconnecting'
          );

          if (pollFailuresRef.current >= 3 && mountedRef.current) {
            setLocalError(
              error?.message ||
                'Server bilan aloqa tiklanmoqda. Stavkangiz serverda saqlangan.'
            );
          }
          setInitializing(false);
        } finally {
          pollBusyRef.current = false;
        }
      }

      if (!stopped) {
        const currentPhase = phaseRef.current;
        const delay =
          currentPhase === 'flying' || currentPhase === 'launching'
            ? 240
            : currentPhase === 'betting'
              ? 360
              : 480;
        const elapsed = window.performance.now() - cycleStartedAt;
        const nextDelay = Math.max(80, delay - elapsed);
        if (timer) window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          timer = null;
          poll();
        }, nextDelay);
      }
    };

    poll();

    const refresh = () => {
      lastSocialAtRef.current = 0;
      if (timer) {
        window.clearTimeout(timer);
        timer = null;
      }

      if (!pollBusyRef.current && !actionBusyRef.current) {
        poll();
      } else {
        timer = window.setTimeout(() => {
          timer = null;
          poll();
        }, 120);
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh();
    };

    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      stopped = true;
      mountedRef.current = false;
      onRoundStateChange?.(false);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [callRocket, onRoundStateChange]);

  useEffect(() => {
    let cancelled = false;

    if (round?.status !== 'crashed') {
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
    if (!canEditBet) return;

    const minimum = Math.max(1, Math.floor(toNumber(config.minBet, 1)));
    const maximum = Math.max(
      minimum,
      Math.floor(toNumber(config.maxBet, DEFAULT_CONFIG.maxBet))
    );
    setBet(
      String(
        clamp(Math.floor(toNumber(value, minimum)), minimum, maximum)
      )
    );
  };

  const validateBet = () => {
    const minimum = Math.max(1, Math.floor(toNumber(config.minBet, 1)));
    const maximum = Math.max(
      minimum,
      Math.floor(toNumber(config.maxBet, DEFAULT_CONFIG.maxBet))
    );

    if (
      !Number.isInteger(numericBet) ||
      numericBet < minimum ||
      numericBet > maximum
    ) {
      throw new Error(
        `Stavka ${minimum}–${formatStars(maximum)} oralig‘ida bo‘lishi kerak.`
      );
    }

    if (numericBet > balance) {
      throw new Error('Balans yetarli emas.');
    }

    if (autoEnabled) {
      const autoValue = toNumber(autoCashout);
      const minimumAuto = toNumber(config.minAutoCashout, 1.1);
      const maximumAuto = toNumber(config.maxAutoCashout, 100);

      if (autoValue < minimumAuto || autoValue > maximumAuto) {
        throw new Error(
          `Auto cashout ${minimumAuto.toFixed(2)}x–${maximumAuto.toFixed(2)}x oralig‘ida bo‘lishi kerak.`
        );
      }
    }
  };

  const placeBet = async () => {
    if (
      actionBusyRef.current ||
      submitting ||
      myBet ||
      phase !== 'betting'
    ) {
      return;
    }

    setLocalError('');

    try {
      validateBet();
      actionBusyRef.current = true;
      setSubmitting(true);
      tg?.HapticFeedback?.impactOccurred?.('medium');

      await callRocket({
        action: 'place',
        bet: numericBet,
        autoCashout: autoEnabled
          ? Number(toNumber(autoCashout).toFixed(2))
          : null,
        includeSocial: true,
      });

      onToast?.('Stavka qabul qilindi');
    } catch (error) {
      errorUntilRef.current = Date.now() + 2500;
      setLocalError(error?.message || 'Stavka qo‘yishda xatolik.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      lastSocialAtRef.current = 0;
    } finally {
      actionBusyRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const cashOut = async () => {
    if (
      actionBusyRef.current ||
      submitting ||
      !activeBet ||
      phase !== 'flying' ||
      !round?.id
    ) {
      return;
    }

    setLocalError('');

    try {
      actionBusyRef.current = true;
      setSubmitting(true);
      tg?.HapticFeedback?.impactOccurred?.('heavy');

      await callRocket({
        action: 'cashout',
        roundId: round.id,
        includeSocial: true,
      });
    } catch (error) {
      errorUntilRef.current = Date.now() + 2500;
      setLocalError(error?.message || 'Cash out bajarilmadi.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      lastSocialAtRef.current = 0;
    } finally {
      actionBusyRef.current = false;
      if (mountedRef.current) setSubmitting(false);
    }
  };

  const retry = async () => {
    if (pollBusyRef.current || actionBusyRef.current) return;
    pollBusyRef.current = true;
    setConnection('connecting');
    errorUntilRef.current = 0;

    try {
      await callRocket({ action: 'state', includeSocial: true });
      pollFailuresRef.current = 0;
    } catch (error) {
      setLocalError(error?.message || 'Qayta ulanish amalga oshmadi.');
      setConnection('reconnecting');
    } finally {
      pollBusyRef.current = false;
      setInitializing(false);
    }
  };

  const handleBack = () => {
    if (activeBet) {
      onToast?.('Aktiv stavka yakunlanguncha kuting.');
      tg?.HapticFeedback?.notificationOccurred?.('warning');
      return;
    }
    onBack?.();
  };

  const actionState = useMemo(() => {
    if (initializing) {
      return {
        label: 'Connecting…',
        sublabel: 'Server vaqti tekshirilmoqda',
        disabled: true,
        kind: 'bet',
      };
    }

    if (submitting) {
      return {
        label: phase === 'flying' ? 'Cashing out…' : 'Placing bet…',
        sublabel: 'Server tasdig‘i kutilmoqda',
        disabled: true,
        kind: phase === 'flying' ? 'cashout' : 'bet',
      };
    }

    if (phase === 'betting') {
      if (myBet) {
        return {
          label: 'Bet placed',
          sublabel: `Take off in ${(countdownMs / 1000).toFixed(1)}s`,
          disabled: true,
          kind: 'placed',
        };
      }

      return {
        label: 'Place bet',
        sublabel: `${formatStars(numericBet)} ⭐ • ${(countdownMs / 1000).toFixed(1)}s left`,
        disabled: balance < 1,
        kind: 'bet',
      };
    }

    if (phase === 'launching') {
      return {
        label: 'Launching…',
        sublabel: myBet ? 'Your bet is active' : 'Next round soon',
        disabled: true,
        kind: 'placed',
      };
    }

    if (phase === 'flying') {
      if (activeBet) {
        return {
          label: `Cash out ${formatStars(possiblePayout)} ⭐`,
          sublabel: `Current ${formatMultiplier(liveMultiplier)}`,
          disabled: false,
          kind: 'cashout',
        };
      }

      if (myBet?.status === 'cashed_out') {
        return {
          label: `Won ${formatStars(myBet.payout)} ⭐`,
          sublabel: `Cashed out at ${formatMultiplier(myBet.cashoutMultiplier)}`,
          disabled: true,
          kind: 'won',
        };
      }

      return {
        label: 'Round in progress',
        sublabel: 'Place your bet in the next round',
        disabled: true,
        kind: 'placed',
      };
    }

    if (myBet?.status === 'cashed_out') {
      return {
        label: `Won ${formatStars(myBet.payout)} ⭐`,
        sublabel: `Cashed out at ${formatMultiplier(myBet.cashoutMultiplier)}`,
        disabled: true,
        kind: 'won',
      };
    }

    if (myBet?.status === 'lost') {
      return {
          label: 'Rocket crashed',
        sublabel: `Crashed at ${formatMultiplier(round?.crashMultiplier)}`,
        disabled: true,
        kind: 'lost',
      };
    }

    return {
      label: 'Next round…',
      sublabel: 'A new 7-second timer is starting',
      disabled: true,
      kind: 'placed',
    };
  }, [
    activeBet,
    balance,
    countdownMs,
    initializing,
    liveMultiplier,
    myBet,
    numericBet,
    phase,
    possiblePayout,
    round?.crashMultiplier,
    submitting,
  ]);

  const primaryAction =
    phase === 'flying' && activeBet ? cashOut : placeBet;
  const connectionLabel =
    connection === 'live'
      ? 'LIVE'
      : connection === 'offline'
        ? 'OFFLINE'
        : connection === 'reconnecting'
          ? 'RECONNECTING'
          : 'SYNCING';

  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
            aria-label="Games bo‘limiga qaytish"
          >
            <BackIcon />
          </button>
          <div>
            <h1>Rocket</h1>
            <span>7-second live rounds</span>
          </div>
        </div>

        <div className={styles.headerTools}>
          <span
            className={`${styles.connectionPill} ${
              connection !== 'live' ? styles.connectionWeak : ''
            }`}
          >
            <i />
            <SignalIcon />
            <b>{connectionLabel}</b>
          </span>
          <span className={styles.balancePill}>
            <StarCoin />
            <strong>{formatStars(balance)}</strong>
          </span>
        </div>
      </header>

      <section className={styles.arena}>
        <FlightScene
          round={round}
          config={config}
          serverNow={serverNow}
        />

        <div className={styles.historyStrip}>
          {history.length ? (
            history.slice(0, 12).map((item) => (
              <span
                className={`${styles.historyChip} ${historyTone(
                  item.crashMultiplier
                )}`}
                key={item.id}
              >
                {formatMultiplier(item.crashMultiplier)}
              </span>
            ))
          ) : (
            <span className={styles.historyPlaceholder}>
              Recent multipliers will appear here
            </span>
          )}
        </div>
      </section>

      {localError ? (
        <div className={styles.errorBox} role="alert">
          <span>{localError}</span>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : null}

      <section className={styles.betCard}>
        <div className={styles.betTopline}>
          <div>
            <span>BET AMOUNT</span>
            <strong>Choose your stake</strong>
          </div>
          <span className={styles.roundTimer}>
            {phase === 'betting'
              ? `${(countdownMs / 1000).toFixed(1)}s`
              : phase === 'flying'
                ? formatMultiplier(liveMultiplier)
                : '—'}
          </span>
        </div>

        <div className={styles.betControls}>
          <button
            type="button"
            disabled={!canEditBet}
            onClick={() =>
              setSafeBet(Math.max(1, Math.floor(numericBet / 2)))
            }
            aria-label="Stavkani yarmiga kamaytirish"
          >
            ½
          </button>

          <label className={styles.betInput}>
            <StarCoin />
            <input
              type="number"
              inputMode="numeric"
              min={config.minBet}
              max={config.maxBet}
              step="1"
              value={bet}
              disabled={!canEditBet}
              onChange={(event) =>
                setBet(event.target.value.replace(/[^\d]/g, ''))
              }
              onBlur={() => setSafeBet(bet)}
              aria-label="Rocket stavkasi"
            />
          </label>

          <button
            type="button"
            disabled={!canEditBet}
            onClick={() => setSafeBet(numericBet * 2)}
            aria-label="Stavkani ikki baravar oshirish"
          >
            2×
          </button>
        </div>

        <div className={styles.quickRow}>
          <div className={styles.quickBets}>
            {QUICK_BETS.map((value) => (
              <button
                type="button"
                key={value}
                className={
                  numericBet === value ? styles.quickBetActive : ''
                }
                disabled={!canEditBet}
                onClick={() => setSafeBet(value)}
              >
                {value}
              </button>
            ))}
            <button
              type="button"
              disabled={!canEditBet || balance < 1}
              onClick={() =>
                setSafeBet(Math.min(balance, config.maxBet))
              }
            >
              MAX
            </button>
          </div>

          <div className={styles.autoControl}>
            <button
              type="button"
              role="switch"
              aria-checked={autoEnabled}
              className={autoEnabled ? styles.autoOn : ''}
              disabled={!canEditBet}
              onClick={() => setAutoEnabled((current) => !current)}
            >
              <i />
            </button>
            <label>
              <span>Auto</span>
              <input
                type="number"
                inputMode="decimal"
                min={config.minAutoCashout}
                max={config.maxAutoCashout}
                step="0.05"
                value={autoCashout}
                disabled={!canEditBet || !autoEnabled}
                onChange={(event) => setAutoCashout(event.target.value)}
                aria-label="Auto cashout koeffitsiyenti"
              />
              <b>x</b>
            </label>
          </div>
        </div>

        <button
          type="button"
          className={`${styles.primaryAction} ${
            styles[`primary_${actionState.kind}`] || ''
          }`}
          disabled={actionState.disabled}
          onClick={primaryAction}
        >
          <strong>{actionState.label}</strong>
          <span>{actionState.sublabel}</span>
        </button>
      </section>

      <section className={styles.playersCard}>
        <div className={styles.playersHeader}>
          <div>
            <span>LIVE BETS</span>
            <h2>Round players</h2>
          </div>
          <span className={styles.playerCount}>
            <i />
            {players.length}
          </span>
        </div>

        <div className={styles.playersList}>
          {players.length ? (
            players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                liveMultiplier={liveMultiplier}
              />
            ))
          ) : (
            <div className={styles.emptyPlayers}>
              <Image
                src="/feature/rocket.webp"
                alt=""
                width={512}
                height={512}
                unoptimized
                draggable="false"
              />
              <div>
                <strong>Waiting for bets</strong>
                <span>Be the first player in this round.</span>
              </div>
            </div>
          )}
        </div>
      </section>

      <details className={styles.fairness}>
        <summary>
          <span>
            <i
              className={
                verification === 'failed' ? styles.fairnessFailed : ''
              }
            >
              {verification === 'failed' ? '!' : '✓'}
            </i>
            Provably fair
          </span>
          <b>
            {verification === 'verified'
              ? 'Verified'
              : shortHash(round?.serverSeedHash)}
          </b>
        </summary>

        <div className={styles.fairnessBody}>
          <p>
            Crash point serverda oldindan yaratiladi va parvoz
            tugamaguncha yashirin qoladi.
          </p>
          {round?.status === 'crashed' ? (
            <>
              <span>Server seed</span>
              <code>{round.serverSeed || '—'}</code>
              <span>SHA-256</span>
              <code>{round.serverSeedHash || '—'}</code>
            </>
          ) : null}
        </div>
      </details>
    </section>
  );
}
