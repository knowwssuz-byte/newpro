'use client';

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Image from 'next/image';
import { ChevronLeft, Wifi } from 'lucide-react';
import styles from './RocketGame.module.css';

const DEFAULT_CONFIG = {
  minBet: 1,
  maxBet: 10000,
  minAutoCashout: 1.1,
  maxAutoCashout: 100,
  bettingWindowMs: 7000,
  resultHoldMs: 1400,
  growthRate: 0.075,
  pollIntervalMs: 180,
  houseEdgePercent: 2,
  algorithmVersion: 4,
};

const PRESENTATION_DELAY_MS = 220;
const MAX_FORWARD_PROJECTION_MS = 520;
const CLOCK_MODULUS = 2147483647;
const QUICK_BETS = [10, 25, 50, 100];
const STAR_FORMATTER = new Intl.NumberFormat('uz-UZ', {
  maximumFractionDigits: 0,
});
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

function toTimestamp(value) {
  if (!value) return NaN;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : NaN;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatStars(value) {
  return STAR_FORMATTER.format(
    Math.max(0, Math.floor(toNumber(value)))
  );
}

function formatMultiplier(value) {
  return `${Math.max(1, toNumber(value, 1)).toFixed(2)}x`;
}

function normalizeRound(value, sampledAt = null) {
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
    sampledAt:
      sampledAt ||
      value.sampledAt ||
      value.sampled_at ||
      null,
    growthRate: clamp(
      toNumber(
        value.growthRate ?? value.growth_rate,
        DEFAULT_CONFIG.growthRate
      ),
      0.01,
      1
    ),
    rhythmSeed: Math.max(
      0,
      Math.floor(
        toNumber(value.rhythmSeed ?? value.rhythm_seed, 0)
      )
    ),
    houseEdgeBps: clamp(
      Math.floor(
        toNumber(
          value.houseEdgeBps ?? value.house_edge_bps,
          DEFAULT_CONFIG.houseEdgePercent * 100
        )
      ),
      0,
      2000
    ),
    algorithmVersion: Math.max(
      1,
      Math.floor(
        toNumber(value.algorithmVersion ?? value.algorithm_version, 1)
      )
    ),
    outcomeSource: String(
      value.outcomeSource || value.outcome_source || 'automatic'
    ),
    biasMode: String(
      value.biasMode || value.bias_mode || 'standard'
    ),
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

function positiveModulo(value, modulus) {
  return ((value % modulus) + modulus) % modulus;
}

function rhythmPhase(seed, multiplier, increment) {
  return (
    (positiveModulo(
      Math.max(0, Math.floor(toNumber(seed))) * multiplier + increment,
      CLOCK_MODULUS
    ) /
      CLOCK_MODULUS) *
    2 *
    Math.PI
  );
}

/*
 * Exact JavaScript mirror of rocket_v3_growth_exponent() in SQL. Every
 * device therefore derives the same visible multiplier from the same server
 * timestamp instead of starting an animation when its own response arrives.
 */
function growthExponentAt(round, elapsedSeconds) {
  const elapsed = Math.max(0, toNumber(elapsedSeconds));
  const growthRate = Math.max(
    0.01,
    toNumber(round?.growthRate, DEFAULT_CONFIG.growthRate)
  );

  if (toNumber(round?.algorithmVersion, 1) < 3) {
    return growthRate * elapsed;
  }

  const phaseOne = rhythmPhase(round?.rhythmSeed, 48271, 1);
  const phaseTwo = rhythmPhase(round?.rhythmSeed, 69621, 7);
  const phaseThree = rhythmPhase(round?.rhythmSeed, 65539, 11);
  const algorithmVersion = toNumber(round?.algorithmVersion, 1);
  const shapedElapsed =
    algorithmVersion >= 4
      ? elapsed +
        (0.34 / 0.38) *
          (Math.sin(0.38 * elapsed + phaseOne) -
            Math.sin(phaseOne)) +
        (0.17 / 1.05) *
          (Math.sin(1.05 * elapsed + phaseTwo) -
            Math.sin(phaseTwo)) +
        (0.07 / 2.6) *
          (Math.sin(2.6 * elapsed + phaseThree) -
            Math.sin(phaseThree))
      : elapsed +
        (0.28 / 0.75) *
          (Math.sin(0.75 * elapsed + phaseOne) -
            Math.sin(phaseOne)) +
        (0.16 / 1.55) *
          (Math.sin(1.55 * elapsed + phaseTwo) -
            Math.sin(phaseTwo)) +
        (0.07 / 3.2) *
          (Math.sin(3.2 * elapsed + phaseThree) -
            Math.sin(phaseThree));

  return Math.max(0, growthRate * shapedElapsed);
}

function growthTempoAt(round, elapsedSeconds) {
  const elapsed = Math.max(0, toNumber(elapsedSeconds));

  if (toNumber(round?.algorithmVersion, 1) < 3) {
    return 0.5;
  }

  const phaseOne = rhythmPhase(round?.rhythmSeed, 48271, 1);
  const phaseTwo = rhythmPhase(round?.rhythmSeed, 69621, 7);
  const phaseThree = rhythmPhase(round?.rhythmSeed, 65539, 11);
  const algorithmVersion = toNumber(round?.algorithmVersion, 1);
  const speedRatio =
    algorithmVersion >= 4
      ? 1 +
        0.34 * Math.cos(0.38 * elapsed + phaseOne) +
        0.17 * Math.cos(1.05 * elapsed + phaseTwo) +
        0.07 * Math.cos(2.6 * elapsed + phaseThree)
      : 1 +
        0.28 * Math.cos(0.75 * elapsed + phaseOne) +
        0.16 * Math.cos(1.55 * elapsed + phaseTwo) +
        0.07 * Math.cos(3.2 * elapsed + phaseThree);
  const minimumSpeed = algorithmVersion >= 4 ? 0.42 : 0.49;
  const speedRange = algorithmVersion >= 4 ? 1.16 : 1.02;

  return clamp((speedRatio - minimumSpeed) / speedRange, 0, 1);
}

function multiplierAt(round, serverTimestamp) {
  const startsAt = toTimestamp(round?.startsAt);

  if (!Number.isFinite(startsAt)) return 1;

  const elapsedSeconds = Math.max(
    0,
    (toNumber(serverTimestamp, startsAt) - startsAt) / 1000
  );
  const exponent = Math.min(
    Math.log(1000),
    growthExponentAt(round, elapsedSeconds)
  );
  const calculated =
    Math.floor(Math.exp(exponent) * 100 + Number.EPSILON) / 100;

  return clamp(calculated, 1, 1000);
}

function presentationSnapshot(round, clockOffset) {
  const actualServerNow = Date.now() + toNumber(clockOffset);
  const presentationNow = actualServerNow - PRESENTATION_DELAY_MS;

  if (!round?.id) {
    return {
      phase: 'waiting',
      multiplier: 1,
      countdownMs: 0,
      stale: false,
      tempo: 0,
    };
  }

  const startsAt = toTimestamp(round.startsAt);
  const settledAt = toTimestamp(round.settledAt);
  const sampledAt = toTimestamp(round.sampledAt);
  const hasStartsAt = Number.isFinite(startsAt);
  const hasSettledAt = Number.isFinite(settledAt);
  const hasSample = Number.isFinite(sampledAt);
  const projectionLimit = hasSample
    ? sampledAt + MAX_FORWARD_PROJECTION_MS
    : presentationNow;
  const visualNow =
    round.status === 'crashed'
      ? presentationNow
      : Math.min(presentationNow, projectionLimit);
  const stale =
    round.status !== 'crashed' &&
    hasSample &&
    presentationNow > projectionLimit + 20;

  if (
    round.status !== 'crashed' &&
    hasStartsAt &&
    actualServerNow < startsAt
  ) {
    return {
      phase: 'betting',
      multiplier: 1,
      countdownMs: Math.max(0, startsAt - actualServerNow),
      stale,
      tempo: 0,
    };
  }

  if (
    round.status === 'crashed' &&
    (!hasSettledAt || presentationNow >= settledAt)
  ) {
    return {
      phase: 'crashed',
      multiplier: Math.max(1, toNumber(round.crashMultiplier, 1)),
      countdownMs: 0,
      stale: false,
      tempo: 0,
    };
  }

  const elapsedSeconds = hasStartsAt
    ? Math.max(0, (visualNow - startsAt) / 1000)
    : 0;
  const calculated = multiplierAt(
    round,
    hasStartsAt ? Math.max(startsAt, visualNow) : visualNow
  );
  const multiplier =
    round.crashMultiplier == null
      ? calculated
      : Math.min(
          calculated,
          Math.max(1, toNumber(round.crashMultiplier, 1))
        );

  return {
    phase: 'flying',
    multiplier,
    countdownMs: 0,
    stale,
    tempo: growthTempoAt(round, elapsedSeconds),
  };
}

function useSynchronizedPresentation(round, clockOffset, performanceMode) {
  const [snapshot, setSnapshot] = useState(() =>
    presentationSnapshot(round, clockOffset)
  );

  useEffect(() => {
    let frame = null;
    let previousFrameAt = 0;
    const minimumFrameGap = performanceMode === 'lite' ? 66 : 33;

    const update = (frameTime) => {
      if (frameTime - previousFrameAt >= minimumFrameGap) {
        previousFrameAt = frameTime;
        const next = presentationSnapshot(round, clockOffset);

        setSnapshot((current) => {
          const sameCountdown =
            Math.floor(current.countdownMs / 100) ===
            Math.floor(next.countdownMs / 100);

          return current.phase === next.phase &&
            current.multiplier === next.multiplier &&
            current.stale === next.stale &&
            Math.abs(current.tempo - next.tempo) < 0.015 &&
            sameCountdown
            ? current
            : next;
        });
      }

      frame = window.requestAnimationFrame(update);
    };

    setSnapshot(presentationSnapshot(round, clockOffset));
    frame = window.requestAnimationFrame(update);

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [clockOffset, performanceMode, round]);

  return snapshot;
}

function clockSampleFromPayload(data, timing = {}) {
  const clientSentAt = toNumber(timing.sentAt, NaN);
  const clientReceivedAt = toNumber(timing.receivedAt, NaN);
  const serverReceivedAt = toTimestamp(data?.serverReceivedAt);
  const serverSentAt = toTimestamp(data?.serverSentAt);

  if (
    Number.isFinite(clientSentAt) &&
    Number.isFinite(clientReceivedAt) &&
    Number.isFinite(serverReceivedAt) &&
    Number.isFinite(serverSentAt) &&
    serverSentAt >= serverReceivedAt
  ) {
    const roundTrip = Math.max(
      0,
      clientReceivedAt -
        clientSentAt -
        (serverSentAt - serverReceivedAt)
    );

    return {
      offset:
        (serverReceivedAt -
          clientSentAt +
          (serverSentAt - clientReceivedAt)) /
        2,
      roundTrip,
    };
  }

  const legacyServerTime = toTimestamp(data?.serverTime);

  if (
    Number.isFinite(clientSentAt) &&
    Number.isFinite(clientReceivedAt) &&
    Number.isFinite(legacyServerTime)
  ) {
    return {
      offset:
        legacyServerTime -
        (clientSentAt + clientReceivedAt) / 2,
      roundTrip: Math.max(0, clientReceivedAt - clientSentAt),
    };
  }

  return null;
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

function isUncertainTransportError(error) {
  const message = String(error?.message || '').toLowerCase();

  return (
    navigator.onLine === false ||
    message.includes('javobi kechikdi') ||
    message.includes('failed to fetch') ||
    message.includes('network')
  );
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

  if (round.outcomeSource === 'manual') return 'manual';
  if (round.outcomeSource === 'forced') return 'forced';

  try {
    const bytes = new TextEncoder().encode(round.serverSeed);
    const digest = await window.crypto.subtle.digest('SHA-256', bytes);
    const digestHex = Array.from(new Uint8Array(digest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    const randomInt = BigInt(`0x${round.serverSeed.slice(0, 13)}`);
    const denominator = 4503599627370497n;
    const houseEdgeBps = BigInt(
      clamp(
        Math.floor(toNumber(round.houseEdgeBps, 200)),
        0,
        2000
      )
    );
    const payoutFactorBps = 10000n - houseEdgeBps;
    const rawCrashCents =
      (payoutFactorBps * denominator) /
      (100n * (randomInt + 1n));
    const baseCrashCents =
      rawCrashCents < 100n
        ? 100n
        : rawCrashCents > 100000n
          ? 100000n
          : rawCrashCents;
    const biasMode = String(round.biasMode || 'standard');
    let crashCents = baseCrashCents;

    if (biasMode === 'low') {
      crashCents =
        100n + ((baseCrashCents - 100n) * 55n) / 100n;
    } else if (biasMode === 'high') {
      const highCrashCents =
        100n + ((baseCrashCents - 100n) * 180n) / 100n;
      crashCents =
        highCrashCents > 100000n ? 100000n : highCrashCents;
    }

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
  return <ChevronLeft aria-hidden="true" strokeWidth={2.15} />;
}

function SignalIcon() {
  return <Wifi aria-hidden="true" strokeWidth={2.15} />;
}

function StarCoin({ small = false }) {
  return (
    <span className={`${styles.coin} ${small ? styles.coinSmall : ''}`}>
      <Image
        src="/currency/stars-4k.webp"
        alt=""
        width={24}
        height={24}
        draggable="false"
      />
    </span>
  );
}

function KineticMultiplier({ value, tempo, roundId }) {
  const [integerPart, fractionPart] = Math.max(
    1,
    toNumber(value, 1)
  )
    .toFixed(2)
    .split('.');
  const safeTempo = clamp(toNumber(tempo), 0, 1);

  return (
    <strong
      className={styles.multiplierValue}
      style={{
        '--multiplier-tempo': safeTempo.toFixed(3),
        '--multiplier-scale': (1 + safeTempo * 0.008).toFixed(4),
        '--multiplier-shift': `${((0.5 - safeTempo) * 1.4).toFixed(2)}px`,
        '--multiplier-roll-duration': `${Math.round(
          300 - safeTempo * 120
        )}ms`,
      }}
      aria-label={`${integerPart}.${fractionPart}x`}
    >
      <span
        className={styles.multiplierInteger}
        key={`${roundId || 'round'}-${integerPart}`}
        aria-hidden="true"
      >
        {integerPart}
      </span>
      <span className={styles.multiplierDot} aria-hidden="true">
        .
      </span>
      <span className={styles.multiplierFraction} aria-hidden="true">
        {fractionPart}
      </span>
      <span className={styles.multiplierX} aria-hidden="true">
        x
      </span>
    </strong>
  );
}

const FlightScene = memo(function FlightScene({
  round,
  config,
  clockOffset,
  performanceMode,
  onAssetReady,
}) {
  const presentation = useSynchronizedPresentation(
    round,
    clockOffset,
    performanceMode
  );
  const countdownMs = presentation.countdownMs;
  const visuallyFlying = presentation.phase === 'flying';
  const crashed = presentation.phase === 'crashed';
  const multiplier = presentation.multiplier;
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
            : presentation.stale
              ? 'SYNCING'
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
          <KineticMultiplier
            value={multiplier}
            tempo={presentation.tempo}
            roundId={round?.id}
          />
          <span className={styles.multiplierCaption}>
            {crashed
              ? 'FINAL MULTIPLIER • CRASHED'
              : 'CASH OUT BEFORE THE BLAST'}
          </span>
        </div>
      )}

      <div className={styles.launchHalo} aria-hidden="true" />
      <div
        className={`${styles.rocket} ${
          crashed ? styles.rocketCrashed : ''
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
          onLoad={onAssetReady}
          onError={onAssetReady}
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
          <span className={styles.explosionAfterglow} />
          <span className={styles.impactSmoke} />
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
}, (previous, next) => {
  return (
    previous.round === next.round &&
    previous.config === next.config &&
    previous.clockOffset === next.clockOffset &&
    previous.performanceMode === next.performanceMode &&
    previous.onAssetReady === next.onAssetReady
  );
});

const PlayerRow = memo(function PlayerRow({ player, liveMultiplier }) {
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
});

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
  const [participantCount, setParticipantCount] = useState(0);
  const [balance, setBalance] = useState(() =>
    Math.max(0, toNumber(profile?.balance))
  );
  const [bet, setBet] = useState('10');
  const [autoEnabled, setAutoEnabled] = useState(false);
  const [autoCashout, setAutoCashout] = useState('2.00');
  const [initializing, setInitializing] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [pendingAction, setPendingAction] = useState('');
  const [localError, setLocalError] = useState('');
  const [connection, setConnection] = useState('connecting');
  const [uiNow, setUiNow] = useState(() => Date.now());
  const [clockOffset, setClockOffset] = useState(0);
  const [verification, setVerification] = useState('pending');
  const [performanceMode, setPerformanceMode] = useState('full');
  const [sceneAssetReady, setSceneAssetReady] = useState(false);
  const [minimumLoaderElapsed, setMinimumLoaderElapsed] = useState(false);

  const mountedRef = useRef(false);
  const actionBusyRef = useRef(false);
  const pollBusyRef = useRef(false);
  const socialBusyRef = useRef(false);
  const phaseRef = useRef('betting');
  const hasClockSampleRef = useRef(false);
  const bestClockRoundTripRef = useRef(Number.POSITIVE_INFINITY);
  const requestSequenceRef = useRef(0);
  const appliedSequenceRef = useRef(0);
  const socialSequenceRef = useRef(0);
  const pollFailuresRef = useRef(0);
  const lastSocialAtRef = useRef(0);
  const lastBetRef = useRef(null);
  const currentRoundIdRef = useRef(null);
  const errorUntilRef = useRef(0);
  const primaryPointerAtRef = useRef(0);

  const serverNow = uiNow + clockOffset;
  const startsAt = toTimestamp(round?.startsAt);
  const countdownMs = Number.isFinite(startsAt)
    ? Math.max(0, startsAt - serverNow)
    : 0;
  const phase =
    round?.status === 'betting' && countdownMs <= 0
      ? 'launching'
      : round?.status || 'betting';
  const liveMultiplier = authoritativeMultiplier(round);
  const numericBet = Math.max(0, Math.floor(toNumber(bet)));
  const betBelongsToRound = myBet?.roundId === round?.id;
  const activeBet =
    betBelongsToRound &&
    (myBet?.status === 'placed' || myBet?.status === 'cashout_pending');
  const cashableBet = betBelongsToRound && myBet?.status === 'placed';
  const cashWindowOpen =
    cashableBet && (phase === 'launching' || phase === 'flying');
  const possiblePayout = activeBet
    ? Math.floor(myBet.bet * liveMultiplier)
    : Math.floor(numericBet * liveMultiplier);
  const canEditBet = phase === 'betting' && !myBet && !submitting;
  const booting =
    initializing || !sceneAssetReady || !minimumLoaderElapsed;

  const markSceneAssetReady = useCallback(() => {
    setSceneAssetReady(true);
  }, []);

  useEffect(() => {
    setBalance(Math.max(0, toNumber(profile?.balance)));
  }, [profile?.balance]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    const minimumTimer = window.setTimeout(
      () => setMinimumLoaderElapsed(true),
      220
    );
    const assetFallbackTimer = window.setTimeout(
      () => setSceneAssetReady(true),
      1800
    );

    return () => {
      window.clearTimeout(minimumTimer);
      window.clearTimeout(assetFallbackTimer);
    };
  }, []);

  useEffect(() => {
    let timer = null;

    const tick = () => {
      setUiNow(Date.now());
      const currentPhase = phaseRef.current;
      timer = window.setTimeout(
        tick,
        currentPhase === 'betting' || currentPhase === 'launching'
          ? 100
          : 1000
      );
    };

    timer = window.setTimeout(tick, 100);

    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const reducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    );

    const detectPerformanceMode = () => {
      const memory = toNumber(navigator.deviceMemory, 8);
      const cores = toNumber(navigator.hardwareConcurrency, 8);
      const saveData = Boolean(navigator.connection?.saveData);
      const narrowScreen = window.innerWidth <= 360;

      setPerformanceMode(
        reducedMotion.matches ||
          saveData ||
          memory <= 4 ||
          cores <= 4 ||
          narrowScreen
          ? 'lite'
          : 'full'
      );
    };

    detectPerformanceMode();
    reducedMotion.addEventListener?.('change', detectPerformanceMode);
    window.addEventListener('resize', detectPerformanceMode);

    return () => {
      reducedMotion.removeEventListener?.('change', detectPerformanceMode);
      window.removeEventListener('resize', detectPerformanceMode);
    };
  }, []);

  const applyPayload = useCallback(
    (data, timing = {}) => {
      if (!mountedRef.current || !data) return;

      const clockSample = clockSampleFromPayload(data, timing);

      if (clockSample) {
        const previousBest = bestClockRoundTripRef.current;
        const firstSample = !hasClockSampleRef.current;
        const trusted =
          firstSample ||
          clockSample.roundTrip <=
            Math.max(350, previousBest + 180);

        if (trusted) {
          setClockOffset((current) => {
            if (firstSample) return clockSample.offset;

            const alpha =
              clockSample.roundTrip <= previousBest + 30 ? 0.24 : 0.08;
            return current + (clockSample.offset - current) * alpha;
          });
          hasClockSampleRef.current = true;
          bestClockRoundTripRef.current = Math.min(
            clockSample.roundTrip,
            Number.isFinite(previousBest)
              ? previousBest * 1.025
              : clockSample.roundTrip
          );
        }
      }

      if (data.config) {
        setConfig((current) => ({ ...current, ...data.config }));
      }

      const nextRound = normalizeRound(
        data.round,
        data.stateSampledAt || data.serverSentAt || data.serverTime
      );
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
          setParticipantCount(0);
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
        setPlayers((current) =>
          current.map((player) =>
            player.isYou
              ? {
                  ...player,
                  status: 'cashed_out',
                  payout: nextBet.payout,
                  cashoutMultiplier: nextBet.cashoutMultiplier,
                }
              : player
          )
        );
        tg?.HapticFeedback?.notificationOccurred?.('success');
        onToast?.(`Yutuq: ${formatStars(nextBet.payout)} ⭐`);
      }

      if (
        previousRoundId &&
        previousRoundId === nextBet?.roundId &&
        previousBetStatus === 'placed' &&
        nextBet.status === 'lost'
      ) {
        setPlayers((current) =>
          current.map((player) =>
            player.isYou
              ? { ...player, status: 'lost', payout: 0 }
              : player
          )
        );
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

      if (data.participantCount != null) {
        setParticipantCount(
          Math.max(0, Math.floor(toNumber(data.participantCount)))
        );
      }

      if (data.balance != null) {
        const nextBalance = Math.max(0, toNumber(data.balance));
        setBalance(nextBalance);
        onBalanceChange?.(nextBalance);
      }

      onRoundStateChange?.(
        nextBet?.status === 'placed' ||
          nextBet?.status === 'cashout_pending'
      );
      setConnection('live');
      if (Date.now() >= errorUntilRef.current) {
        setLocalError('');
      }
      setInitializing(false);
    },
    [onBalanceChange, onRoundStateChange, onToast, tg]
  );

  const callRocket = useCallback(
    async (body, { supersede = false } = {}) => {
      const sequence = ++requestSequenceRef.current;

      if (supersede) {
        /*
         * Ignore a slower state poll that started before a balance-changing
         * action. Otherwise that old payload can briefly undo optimistic UI.
         */
        appliedSequenceRef.current = sequence;
      }

      const sentAt = Date.now();
      const data = await apiPost('/api/rocket', body, {
        timeoutMs: body?.action === 'state' ? 4500 : 6500,
      });
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

  const refreshSocial = useCallback(async () => {
    const roundId = currentRoundIdRef.current;

    if (
      !mountedRef.current ||
      !roundId ||
      socialBusyRef.current ||
      document.visibilityState === 'hidden'
    ) {
      return;
    }

    const sequence = ++socialSequenceRef.current;
    socialBusyRef.current = true;

    try {
      const data = await apiPost(
        '/api/rocket',
        {
          action: 'social',
          roundId,
        },
        { timeoutMs: 4500 }
      );

      if (
        !mountedRef.current ||
        sequence !== socialSequenceRef.current ||
        String(data?.roundId || '') !==
          String(currentRoundIdRef.current || '')
      ) {
        return;
      }

      if (Array.isArray(data.history)) setHistory(data.history);
      if (Array.isArray(data.players)) setPlayers(data.players);
      if (data.participantCount != null) {
        setParticipantCount(
          Math.max(0, Math.floor(toNumber(data.participantCount)))
        );
      }
      lastSocialAtRef.current = Date.now();
    } catch {
      /*
       * Social data is deliberately non-blocking. Core round/balance polling
       * continues even if this secondary request times out.
       */
    } finally {
      if (sequence === socialSequenceRef.current) {
        socialBusyRef.current = false;
      }
    }
  }, [apiPost]);

  useEffect(() => {
    if (
      !round?.id ||
      round.status !== 'betting' ||
      !Number.isFinite(startsAt)
    ) {
      return undefined;
    }

    /*
     * Wake the UI on the exact server-synchronised launch boundary. The cash
     * button therefore opens immediately at 0.0s instead of waiting for the
     * next regular poll. A lightweight state sync follows when the connection
     * is free so the server phase catches up just as quickly.
     */
    const remaining = startsAt - (Date.now() + clockOffset);
    const timer = window.setTimeout(() => {
      setUiNow(Date.now());

      if (
        mountedRef.current &&
        !pollBusyRef.current &&
        !actionBusyRef.current
      ) {
        pollBusyRef.current = true;
        callRocket({ action: 'state', includeSocial: false })
          .catch(() => {
            setConnection(
              navigator.onLine === false ? 'offline' : 'reconnecting'
            );
          })
          .finally(() => {
            pollBusyRef.current = false;
          });
      }
    }, Math.max(0, remaining) + 4);

    return () => window.clearTimeout(timer);
  }, [
    callRocket,
    clockOffset,
    round?.id,
    round?.status,
    round?.startsAt,
    startsAt,
  ]);

  useEffect(() => {
    mountedRef.current = true;
    let stopped = false;
    let timer = null;

    const poll = async () => {
      if (stopped) return;
      const cycleStartedAt = window.performance.now();
      const hidden = document.visibilityState === 'hidden';

      if (
        !hidden &&
        !pollBusyRef.current &&
        !actionBusyRef.current
      ) {
        pollBusyRef.current = true;

        try {
          await callRocket({
            action: 'state',
            includeSocial: false,
          });
          pollFailuresRef.current = 0;

          const currentPhase = phaseRef.current;
          const socialInterval =
            currentPhase === 'flying' ||
            currentPhase === 'launching'
              ? 900
              : 1300;

          if (
            Date.now() - lastSocialAtRef.current >= socialInterval
          ) {
            void refreshSocial();
          }
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
        const baseDelay =
          hidden
            ? 1200
            : currentPhase === 'flying' ||
                currentPhase === 'launching'
              ? 180
              : currentPhase === 'betting'
                ? 320
                : 460;
        const failureDelay = Math.min(
          2400,
          baseDelay * 2 ** Math.min(pollFailuresRef.current, 3)
        );
        const delay =
          pollFailuresRef.current > 0 ? failureDelay : baseDelay;
        const elapsed = window.performance.now() - cycleStartedAt;
        const nextDelay = Math.max(16, delay - elapsed);
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
      socialSequenceRef.current += 1;
      socialBusyRef.current = false;
      onRoundStateChange?.(false);
      if (timer) window.clearTimeout(timer);
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [callRocket, onRoundStateChange, refreshSocial]);

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
    let optimisticBet = null;
    const balanceBefore = balance;
    const participantCountBefore = participantCount;

    try {
      validateBet();
      actionBusyRef.current = true;
      setSubmitting(true);
      setPendingAction('place');
      tg?.HapticFeedback?.impactOccurred?.('medium');

      const cleanAutoCashout = autoEnabled
        ? Number(toNumber(autoCashout).toFixed(2))
        : null;
      optimisticBet = {
        id: `optimistic-${round?.id || 'round'}-${Date.now()}`,
        roundId: round?.id || '',
        status: 'placed',
        bet: numericBet,
        payout: 0,
        autoCashout: cleanAutoCashout,
        cashoutMultiplier: null,
        optimistic: true,
      };

      /*
       * Give touch feedback immediately. The server remains authoritative;
       * this local state is replaced by the RPC response or rolled back.
       */
      setMyBet(optimisticBet);
      lastBetRef.current = optimisticBet;
      const optimisticBalance = Math.max(0, balanceBefore - numericBet);
      setBalance(optimisticBalance);
      setParticipantCount((current) => current + 1);
      onBalanceChange?.(optimisticBalance);
      onRoundStateChange?.(true);

      await callRocket(
        {
          action: 'place',
          bet: numericBet,
          autoCashout: cleanAutoCashout,
          includeSocial: false,
        },
        { supersede: true }
      );

      lastSocialAtRef.current = 0;
      onToast?.('Stavka qabul qilindi');
    } catch (error) {
      if (optimisticBet && isUncertainTransportError(error)) {
        setConnection(
          navigator.onLine === false ? 'offline' : 'reconnecting'
        );
        errorUntilRef.current = Date.now() + 1800;
        setLocalError(
          'Stavka serverda tekshirilmoqda. Qayta bosmang — holat avtomatik tiklanadi.'
        );
        lastSocialAtRef.current = 0;
        return;
      }

      if (
        optimisticBet &&
        lastBetRef.current?.id === optimisticBet.id
      ) {
        lastBetRef.current = null;
        setMyBet((current) =>
          current?.id === optimisticBet.id ? null : current
        );
        setBalance(balanceBefore);
        setParticipantCount((current) =>
          Math.max(participantCountBefore, current - 1)
        );
        onBalanceChange?.(balanceBefore);
        onRoundStateChange?.(false);
      }

      errorUntilRef.current = Date.now() + 2500;
      setLocalError(error?.message || 'Stavka qo‘yishda xatolik.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      lastSocialAtRef.current = 0;
    } finally {
      actionBusyRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
        setPendingAction('');
      }
    }
  };

  const cashOut = async () => {
    if (
      actionBusyRef.current ||
      submitting ||
      !cashableBet ||
      (phase !== 'flying' && phase !== 'launching') ||
      !round?.id
    ) {
      return;
    }

    setLocalError('');
    const betBeforeCashout = myBet;

    try {
      actionBusyRef.current = true;
      setSubmitting(true);
      setPendingAction('cashout');
      tg?.HapticFeedback?.impactOccurred?.('heavy');

      setMyBet((current) =>
        current?.id === betBeforeCashout?.id
          ? { ...current, status: 'cashout_pending' }
          : current
      );
      onRoundStateChange?.(true);

      await callRocket(
        {
          action: 'cashout',
          roundId: round.id,
          includeSocial: false,
        },
        { supersede: true }
      );
      lastSocialAtRef.current = 0;
    } catch (error) {
      if (isUncertainTransportError(error)) {
        setConnection(
          navigator.onLine === false ? 'offline' : 'reconnecting'
        );
        errorUntilRef.current = Date.now() + 1800;
        setLocalError(
          'Cash out serverda tekshirilmoqda. Natija avtomatik tiklanadi.'
        );
        lastSocialAtRef.current = 0;
        return;
      }

      setMyBet((current) =>
        current?.id === betBeforeCashout?.id &&
        current?.status === 'cashout_pending'
          ? betBeforeCashout
          : current
      );
      lastBetRef.current = betBeforeCashout;
      onRoundStateChange?.(true);
      errorUntilRef.current = Date.now() + 2500;
      setLocalError(error?.message || 'Cash out bajarilmadi.');
      tg?.HapticFeedback?.notificationOccurred?.('error');
      lastSocialAtRef.current = 0;
    } finally {
      actionBusyRef.current = false;
      if (mountedRef.current) {
        setSubmitting(false);
        setPendingAction('');
      }
    }
  };

  const retry = async () => {
    if (pollBusyRef.current || actionBusyRef.current) return;
    pollBusyRef.current = true;
    setConnection('connecting');
    errorUntilRef.current = 0;

    try {
      await callRocket({ action: 'state', includeSocial: false });
      pollFailuresRef.current = 0;
      lastSocialAtRef.current = 0;
      void refreshSocial();
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

    if (pendingAction === 'place') {
      return {
        label: 'Bet placed',
        sublabel: `Take off in ${(countdownMs / 1000).toFixed(1)}s • confirming`,
        disabled: true,
        kind: 'placed',
      };
    }

    if (pendingAction === 'cashout') {
      return {
        label: 'Cash out sent',
        sublabel: `Locked at server time • ${formatMultiplier(
          liveMultiplier
        )}`,
        disabled: true,
        kind: 'cashoutPending',
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
      if (cashWindowOpen) {
        return {
          label: `Cash out ${formatStars(possiblePayout)} ⭐`,
          sublabel: 'Launch started • tap now',
          disabled: false,
          kind: 'cashout',
        };
      }

      return {
        label: 'Launching…',
        sublabel: myBet ? 'Your bet is active' : 'Next round soon',
        disabled: true,
        kind: 'placed',
      };
    }

    if (phase === 'flying') {
      if (cashableBet) {
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
    balance,
    cashableBet,
    cashWindowOpen,
    countdownMs,
    initializing,
    liveMultiplier,
    myBet,
    numericBet,
    phase,
    possiblePayout,
    pendingAction,
    round?.crashMultiplier,
  ]);

  const primaryAction = cashWindowOpen ? cashOut : placeBet;
  const handlePrimaryPointerUp = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    primaryPointerAtRef.current = Date.now();
    primaryAction();
  };
  const handlePrimaryClick = () => {
    if (Date.now() - primaryPointerAtRef.current < 450) return;
    primaryAction();
  };
  const connectionLabel =
    connection === 'live'
      ? 'LIVE'
      : connection === 'offline'
        ? 'OFFLINE'
        : connection === 'reconnecting'
          ? 'RECONNECTING'
          : 'SYNCING';
  const outcomeSource = String(round?.outcomeSource || 'automatic');
  const operatorControlled =
    outcomeSource === 'manual' || outcomeSource === 'forced';
  const fairnessTitle =
    outcomeSource === 'forced'
      ? 'Operator stopped'
      : outcomeSource === 'manual'
        ? 'Operator planned'
        : 'Provably fair';
  const fairnessStatus =
    verification === 'verified'
      ? 'Verified'
      : verification === 'manual'
        ? 'Planned'
        : verification === 'forced'
          ? 'Stopped live'
          : shortHash(round?.serverSeedHash);

  return (
    <section
      className={styles.root}
      data-performance={performanceMode}
      aria-busy={booting}
    >
      {booting ? (
        <div className={styles.bootOverlay} role="status" aria-live="polite">
          <div className={styles.bootLoader}>
            <span className={styles.bootOrbit} aria-hidden="true">
              <i />
            </span>
            <strong>Rocket yuklanmoqda</strong>
            <span>Jonli raund sinxronlanmoqda</span>
          </div>
        </div>
      ) : null}

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
          clockOffset={clockOffset}
          performanceMode={performanceMode}
          onAssetReady={markSceneAssetReady}
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
          aria-busy={submitting}
          onPointerUp={handlePrimaryPointerUp}
          onClick={handlePrimaryClick}
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
            {participantCount}
          </span>
        </div>

        <div className={styles.playersList}>
          {players.length ? (
            players.map((player) => (
              <PlayerRow
                key={player.id}
                player={player}
                liveMultiplier={player.isYou ? liveMultiplier : 1}
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
                verification === 'failed'
                  ? styles.fairnessFailed
                  : operatorControlled
                    ? styles.fairnessManual
                    : ''
              }
            >
              {verification === 'failed'
                ? '!'
                : operatorControlled
                  ? '⚙'
                  : '✓'}
            </i>
            {fairnessTitle}
          </span>
          <b>{fairnessStatus}</b>
        </summary>

        <div className={styles.fairnessBody}>
          <p>
            {outcomeSource === 'forced'
              ? 'Raund operator tomonidan jonli koeffitsiyentda yakunlangan. Bu holat tarixda alohida qayd etiladi.'
              : outcomeSource === 'manual'
                ? 'Crash point operator rejasidan olingan va parvoz tugamaguncha o‘yinchilarga yashirin saqlangan.'
                : 'Crash point server seed’dan oldindan yaratiladi va parvoz tugamaguncha yashirin qoladi.'}
          </p>
          <span>Round rules</span>
          <code>
            Algorithm v{round?.algorithmVersion || 1} • source{' '}
            {outcomeSource} • distribution {round?.biasMode || 'standard'}
            {outcomeSource === 'automatic' &&
            (round?.biasMode || 'standard') === 'standard'
              ? ` • ${(
                  100 -
                  toNumber(round?.houseEdgeBps, 200) / 100
                ).toFixed(2)}% theoretical RTP`
              : ''}
          </code>
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
