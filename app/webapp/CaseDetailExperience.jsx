'use client';

// Loaded only when the user actually opens a case detail page.
// This keeps roulette motion, result artwork and lifecycle code out of boot.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import AppIcon from './AppIcon';
import StarIcon from './StarIcon';
import caseOpeningStyles from './CaseOpening.module.css';

const CASE_ROLL_DURATION_MS = 4600;
const CASE_ART_STAGE_MS = 480;

// Existing server-provided case art, framed without forged mechanical pieces.
function CaseArtwork({ caseItem, activating }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { setFailed(false); setReady(false); }, [caseItem?.image_url]);
  return (
    <div className={caseOpeningStyles.caseStage} data-activating={activating ? 'true' : 'false'}
      aria-label="Case rasmi" role="img">
      <span className={caseOpeningStyles.caseStageAura} aria-hidden="true" />
      {caseItem?.image_url && !failed ? (
        <img className={caseOpeningStyles.caseStageArt} src={caseItem.image_url}
          alt="" decoding="async" loading="eager" fetchPriority="high"
          data-ready={ready ? 'true' : 'false'}
          onLoad={() => setReady(true)} onError={() => setFailed(true)} draggable={false} />
      ) : (
        <div className={caseOpeningStyles.caseStagePlaceholder} aria-hidden="true"><AppIcon name="box" /></div>
      )}
      <div className={caseOpeningStyles.caseStageGlow} aria-hidden="true" />
      <span className={caseOpeningStyles.caseStageSignature}>MYST / CASE COLLECTION</span>
    </div>
  );
}

function useCaseSound(enabled) {
  const contextRef = useRef(null);
  useEffect(() => () => {
    if (contextRef.current) { void contextRef.current.close().catch(() => {}); contextRef.current = null; }
  }, []);
  return useCallback((kind) => {
    if (!enabled) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = contextRef.current || new Ctx();
      contextRef.current = ctx;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const sounds = { open: [540,240,.18,.026], spin: [790,530,.115,.015], win: [590,910,.29,.035] };
      const [start,end,duration,loudness] = sounds[kind] || sounds.open;
      const osc = ctx.createOscillator(), gain = ctx.createGain(), t = ctx.currentTime;
      osc.type = 'sine';
      osc.frequency.setValueAtTime(start,t);
      osc.frequency.exponentialRampToValueAtTime(end,t+duration);
      gain.gain.setValueAtTime(.0001,t);
      gain.gain.exponentialRampToValueAtTime(loudness,t+.015);
      gain.gain.exponentialRampToValueAtTime(.0001,t+duration);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
      osc.start(t); osc.stop(t+duration+.025);
    } catch { /* audio must never block opening */ }
  }, [enabled]);
}

function InlineRaffleRoller({ opening, idleGifts, targetIndex = 0, onRollComplete, helpers }) {
  const { GiftMedia, solidGiftBackground, defaultGiftBackground } = helpers;
  const trackRef = useRef(null);
  const finalDistanceRef = useRef(null);
  const completedSpinRef = useRef(null);
  const [rollerStyle, setRollerStyle] = useState({
    '--raffle-x': '0px',
    '--raffle-transition': 'none',
  });

  const isLive =
    opening?.stage === 'rolling' || opening?.stage === 'result';
  const isResult = opening?.stage === 'result';
  const isRolling = opening?.stage === 'rolling';
  const isPreparing = opening?.stage === 'preparing';
  const reel = isLive ? opening.reel : idleGifts;

  const measureCardDistance = useCallback((index) => {
    const track = trackRef.current;
    const viewport = track?.parentElement;
    const card = track?.children?.[index];

    if (!track || !viewport || !card) return 0;

    return Math.max(
      0,
      card.offsetLeft +
        card.offsetWidth / 2 -
        viewport.clientWidth / 2
    );
  }, []);

  useLayoutEffect(() => {
    let firstFrame = null;
    let secondFrame = null;

    const resetStyle = {
      '--raffle-x': '0px',
      '--raffle-transition': 'none',
    };

    if (!opening || opening.stage === 'preparing') {
      finalDistanceRef.current = null;
      completedSpinRef.current = null;
      setRollerStyle(resetStyle);
      return undefined;
    }

    if (opening.stage === 'result') {
      const measuredDistance =
        finalDistanceRef.current ?? measureCardDistance(targetIndex);

      finalDistanceRef.current = measuredDistance;
      setRollerStyle({
        '--raffle-x': `-${measuredDistance}px`,
        '--raffle-transition': 'none',
      });
      return undefined;
    }

    if (opening.stage !== 'rolling') {
      return undefined;
    }

    const startIndex = Math.min(3, Math.max(0, targetIndex - 1));
    const startDistance = measureCardDistance(startIndex);
    const measuredDistance = measureCardDistance(targetIndex);
    const reduceMotion = window.matchMedia?.(
      '(prefers-reduced-motion: reduce)'
    )?.matches;
    const duration = reduceMotion ? 320 : CASE_ROLL_DURATION_MS;

    finalDistanceRef.current = measuredDistance;
    completedSpinRef.current = null;

    setRollerStyle({
      '--raffle-x': `-${startDistance}px`,
      '--raffle-transition': 'none',
    });

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setRollerStyle({
          '--raffle-x': `-${measuredDistance}px`,
          '--raffle-transition': `transform ${duration}ms cubic-bezier(.10,.68,.08,1)`,
        });
      });
    });

    return () => {
      if (firstFrame) window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
    };
  }, [measureCardDistance, opening, targetIndex]);

  const finishRoll = (event) => {
    if (
      !isRolling ||
      event.target !== trackRef.current ||
      event.propertyName !== 'transform' ||
      completedSpinRef.current === opening?.spinKey
    ) {
      return;
    }

    completedSpinRef.current = opening.spinKey;
    onRollComplete?.(opening.spinKey);
  };

  const idleLoopBase = idleGifts.length
    ? Array.from({ length: Math.max(18, idleGifts.length * 5) }, (_, index) => idleGifts[index % idleGifts.length])
    : [];
  const idleLoopGifts = idleLoopBase.length ? [...idleLoopBase, ...idleLoopBase] : [];

  return (
    <div
      className={[
        caseOpeningStyles.roller,
        isLive ? caseOpeningStyles.live : '',
        isResult ? caseOpeningStyles.result : '',
        isPreparing ? caseOpeningStyles.preparing : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Case prizes preview"
      aria-busy={isPreparing || isRolling}
    >
      <span className={caseOpeningStyles.centerGuide} aria-hidden="true" />
      <span
        className={`${caseOpeningStyles.marker} ${caseOpeningStyles.markerTop}`}
        aria-hidden="true"
      />
      <span
        className={`${caseOpeningStyles.marker} ${caseOpeningStyles.markerBottom}`}
        aria-hidden="true"
      />

      {!isLive ? (
        <div
          className={`${caseOpeningStyles.idleTrack} ${
            isPreparing ? caseOpeningStyles.idleTrackPaused : ''
          }`}
        >
          {idleLoopGifts.map((gift, index) => (
            <div
              className={caseOpeningStyles.card}
              key={`${gift?.id || 'gift'}-idle-${index}`}
              style={{
                '--gift-color': solidGiftBackground(
                  gift?.background_value,
                  defaultGiftBackground(gift?.rarity)
                ),
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!idleLoopGifts.length ? (
            <div className={caseOpeningStyles.emptyCard}>
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      ) : (
        <div
          ref={trackRef}
          className={`${caseOpeningStyles.spinTrack} ${
            isRolling ? caseOpeningStyles.rolling : ''
          }`}
          style={rollerStyle}
          onTransitionEnd={finishRoll}
        >
          {reel.map((gift, index) => (
            <div
              className={`${caseOpeningStyles.card} ${
                index === targetIndex ? caseOpeningStyles.winnerCard : ''
              }`}
              data-winning={index === targetIndex ? 'true' : undefined}
              key={`${gift?.id || 'gift'}-${index}-${opening?.spinKey || 'idle'}`}
              style={{
                '--gift-color': solidGiftBackground(
                  gift?.background_value,
                  defaultGiftBackground(gift?.rarity)
                ),
              }}
            >
              <GiftMedia gift={gift} preferStatic />
            </div>
          ))}

          {!reel.length ? (
            <div className={caseOpeningStyles.emptyCard}>
              <AppIcon name="box" />
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function CaseWinResult({ opening, onClose, onSell, helpers }) {
  const { GiftMedia, solidGiftBackground, defaultGiftBackground, isBalanceReward, rewardSubtitle, sellButtonText } = helpers;
  if (!opening?.gift || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={`win-screen-layer ${caseOpeningStyles.resultPortal}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="case-win-title"
    >
      <div
        className={`win-screen-card ${caseOpeningStyles.resultPanel} ${
          isBalanceReward(opening.gift) ? 'balance-win' : ''
        }`}
        style={{
          '--win-screen-bg': solidGiftBackground(
            opening.gift?.background_value,
            defaultGiftBackground(opening.gift?.rarity)
          ),
        }}
      >
        <span className="win-screen-shine" aria-hidden="true" />
        <span className="win-screen-badge">YOU WON</span>

        <div className="win-screen-media">
          <GiftMedia gift={opening.gift} animate />
        </div>

        <div className="win-screen-copy">
          <strong id="case-win-title">{opening.gift?.title || 'Reward'}</strong>
          <p>{rewardSubtitle(opening.gift)}</p>
        </div>

        <div className="win-screen-actions">
          {!isBalanceReward(opening.gift) ? (
            <button type="button" className="sell-btn" onClick={() => onSell(opening)}>
              {sellButtonText(opening.gift)}
            </button>
          ) : (
            <button type="button" className="sell-btn" onClick={onClose}>
              Balansga qo‘shildi
            </button>
          )}
          <button type="button" className="close-win-btn" onClick={onClose}>
            Yopish
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function CaseDetailPage({
  caseItem,
  gifts,
  opening,
  busy,
  onBack,
  onOpen,
  onCloseResult,
  onSellResult,
  onRollComplete,
  helpers,
}) {
  const { GiftMedia, eligibleGift, openableGift, formatPrice, getWinningIndexFromReel,
    caseAccent, caseBadgeColor, solidGiftBackground, defaultGiftBackground, visibleChance } = helpers;
  const readyGifts = gifts.filter(eligibleGift);
  const openableGifts = readyGifts.filter(openableGift);
  const isFree = Number(caseItem.price || 0) === 0;
  const openText = isFree ? 'OPEN' : `OPEN ${formatPrice(caseItem.price)}`;
  const previewGifts = readyGifts.length ? readyGifts : gifts;
  const inlineOpening = opening && String(opening.caseItem?.id) === String(caseItem.id) ? opening : null;
  const isSpinning = inlineOpening && inlineOpening.stage !== 'result';
  const isResult = inlineOpening?.stage === 'result';
  const isOpeningActive = Boolean(inlineOpening);
  const targetIndex =
    typeof inlineOpening?.winningIndex === 'number'
      ? inlineOpening.winningIndex
      : getWinningIndexFromReel(inlineOpening?.reel || []);
  const stripSource = previewGifts.length ? previewGifts : [];
  const stripGifts = stripSource.length
    ? Array.from({ length: Math.min(9, Math.max(7, stripSource.length)) }, (_, index) => stripSource[index % stripSource.length])
    : [];

  useLayoutEffect(() => {
    if (!isOpeningActive) return undefined;

    const root = document.documentElement;
    const body = document.body;
    const scrollY =
      window.scrollY || root.scrollTop || body.scrollTop || 0;
    const previousBody = {
      position: body.style.position,
      top: body.style.top,
      right: body.style.right,
      left: body.style.left,
      width: body.style.width,
      overflow: body.style.overflow,
      overscrollBehavior: body.style.overscrollBehavior,
    };
    const previousRoot = {
      overflow: root.style.overflow,
      overscrollBehavior: root.style.overscrollBehavior,
    };

    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.right = '0';
    body.style.left = '0';
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';

    const preventScroll = (event) => {
      if (event.cancelable) event.preventDefault();
    };

    document.addEventListener('touchmove', preventScroll, { passive: false });
    document.addEventListener('wheel', preventScroll, { passive: false });

    return () => {
      document.removeEventListener('touchmove', preventScroll);
      document.removeEventListener('wheel', preventScroll);

      body.style.position = previousBody.position;
      body.style.top = previousBody.top;
      body.style.right = previousBody.right;
      body.style.left = previousBody.left;
      body.style.width = previousBody.width;
      body.style.overflow = previousBody.overflow;
      body.style.overscrollBehavior = previousBody.overscrollBehavior;
      root.style.overflow = previousRoot.overflow;
      root.style.overscrollBehavior = previousRoot.overscrollBehavior;

      window.scrollTo({ top: scrollY, left: 0, behavior: 'auto' });
    };
  }, [isOpeningActive]);

  return (
    <section className={`case-page-screen ${isSpinning ? 'is-inline-spinning' : ''} ${isResult ? 'has-inline-result' : ''}`}>
      <div className="case-page-top">
        <button
          type="button"
          className="case-page-back"
          onClick={onBack}
          disabled={isSpinning}
          aria-label="Back"
        >
          ←
        </button>
        <div>
          <span className="eyebrow">Case detail</span>
          <h1>{caseItem.title}</h1>
        </div>
      </div>

      <div
        className="case-page-hero premium-card inline-case-hero"
        style={{
          '--case-page-accent': caseAccent(caseItem),
          '--case-page-badge': caseBadgeColor(caseItem),
        }}
      >
        <span className="case-page-glow glow-one" aria-hidden="true" />
        <span className="case-page-glow glow-two" aria-hidden="true" />

        <div className="case-page-copy">
          <span className="case-page-pill">Premium case</span>
          <h2>{caseItem.title}</h2>
          <p>{caseItem.description || `${readyGifts.length || gifts.length || 0} ta sovg‘a ichidan random yutuq.`}</p>
        </div>

        <InlineRaffleRoller
          opening={inlineOpening}
          idleGifts={stripGifts}
          targetIndex={targetIndex}
          onRollComplete={onRollComplete}
          helpers={helpers}
        />

        <button
          type="button"
          className={caseOpeningStyles.openButton}
          disabled={busy || isSpinning || openableGifts.length === 0}
          onClick={onOpen}
          aria-busy={isSpinning}
          aria-live="polite"
        >
          <AppIcon name="spark" />
          <span>{isSpinning ? (inlineOpening.stage === 'preparing' ? 'OPENING' : 'ROLLING') : openText}</span>
        </button>

      </div>

      {isResult ? (
        <CaseWinResult
          opening={inlineOpening}
          onClose={onCloseResult}
          onSell={onSellResult}
          helpers={helpers}
        />
      ) : null}

      <div className="case-page-prizes-head">
        <div>
          <span className="eyebrow">Inside this case</span>
          <h2>Sovg‘alar</h2>
        </div>
        <strong>{previewGifts.length || 0} ta</strong>
      </div>

      <div className="case-page-prize-grid">
        {previewGifts.map((gift, index) => (
          <div
            className="case-page-prize-card"
            key={gift.id}
            style={{
              '--float-delay': `${(index % 6) * 0.13}s`,
              '--gift-card-bg': solidGiftBackground(gift.background_value, defaultGiftBackground(gift.rarity)),
            }}
          >
            <span className="prize-card-shine" aria-hidden="true" />
            <div className="case-page-prize-image">
              <GiftMedia gift={gift} compact animateOnEnter />
            </div>
            <div className="case-page-prize-copy">
              <strong>{gift.title}</strong>
              <span>{visibleChance(gift)}% · stock {gift.stock}</span>
            </div>
          </div>
        ))}
        {!previewGifts.length ? (
          <div className="case-page-empty-prizes">
            <AppIcon name="box" />
            <strong>Hozircha sovg‘alar yo‘q</strong>
            <span>Bu case tez orada to‘ldiriladi.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

