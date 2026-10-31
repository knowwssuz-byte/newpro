'use client';

// Loaded only when the user actually opens a case detail page.
// This keeps roulette motion, result artwork and lifecycle code out of boot.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import AppIcon from './AppIcon';
import StarIcon from './StarIcon';
import caseOpeningStyles from './CaseOpening.module.css';
import {caseImageStyle} from '@/lib/caseImageLayout.mjs';
import {buildIdlePreviewStrip} from '@/lib/caseReelPresentation.mjs';
import {sortCasePrizesHighToLow} from '@/lib/casePrizeOrder.mjs';

const CASE_ROLL_DURATION_MS = 4600;


// Existing server-provided case art, framed without forged mechanical pieces.
function CaseArtwork({ caseItem, activating }) {
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const vectorArt=/\.svg(?:[?#]|$)/i.test(caseItem?.image_url||'');
  useEffect(() => { setFailed(false); setReady(false); }, [caseItem?.image_url]);
  return (
    <div className={caseOpeningStyles.caseStage} data-activating={activating ? 'true' : 'false'}
      style={caseImageStyle(caseItem)} aria-label="Case rasmi" role="img">
      {caseItem?.image_url && !failed ? (
        vectorArt ? <img className={caseOpeningStyles.caseStageBackdrop} src={caseItem.image_url}
          alt="" aria-hidden="true" decoding="async" loading="eager" /> :
        <Image className={caseOpeningStyles.caseStageBackdrop} src={caseItem.image_url}
          alt="" aria-hidden="true" width={960} height={960}
          sizes="(max-width:600px) 96vw, 480px" quality={78} decoding="async" loading="eager" />
      ) : null}
      <span className={caseOpeningStyles.caseStageAura} aria-hidden="true" />
      {caseItem?.image_url && !failed ? (
        vectorArt ? <img className={caseOpeningStyles.caseStageArt} src={caseItem.image_url}
          alt="" decoding="async" loading="eager" fetchPriority="high"
          data-ready={ready ? 'true' : 'false'}
          onLoad={() => setReady(true)} onError={() => setFailed(true)} draggable={false} /> :
        <Image className={caseOpeningStyles.caseStageArt} src={caseItem.image_url}
          alt="" width={960} height={960}
          sizes="(max-width:600px) 96vw, 480px" quality={78}
          decoding="async" loading="eager" fetchPriority="high"
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
    ? Array.from({ length: 18 }, (_, index) => idleGifts[index % idleGifts.length])
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

function CaseWinResult({ opening, onClose, onSell, onInventory, onAgain, helpers }) {
  const { GiftMedia, isBalanceReward, rewardSubtitle, sellButtonText } = helpers;
  const modalRef = useRef(null);
  const gift = opening?.gift;
  const isStars = Boolean(gift && isBalanceReward(gift));
  const isXp=gift?.type==='xp';

  // Modal accessibility: focus the close control and support Escape, without
  // altering document body scroll or introducing heavy animation libraries.
  useEffect(() => {
    if (!gift || typeof document === 'undefined') return undefined;
    const previousFocus = document.activeElement;
    modalRef.current?.focus({ preventScroll: true });
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
        previousFocus.focus({ preventScroll: true });
      }
    };
  }, [gift?.id, onClose]);

  if (!gift || typeof document === 'undefined') return null;
  const rarity = String(gift.rarity || 'common').toLowerCase();

  return createPortal(
    <div className={caseOpeningStyles.resultPortal}
      role="dialog" aria-modal="true" aria-labelledby="case-win-title"
      aria-describedby="case-win-description">
      <div className={caseOpeningStyles.resultPanel} ref={modalRef} tabIndex={-1}
        data-rarity={rarity} data-reward-kind={isStars ? 'stars' : isXp ? 'xp' : 'collectible'}>
        <span className={caseOpeningStyles.resultAmbient} aria-hidden="true" />
        <span className={caseOpeningStyles.resultShimmer} aria-hidden="true" />
        <button type="button" className={caseOpeningStyles.resultClose}
          onClick={onClose} aria-label="Yutuq oynasini yopish">
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M5 5l14 14M19 5L5 19"/>
          </svg>
        </button>

        <header className={caseOpeningStyles.resultHeader}>
          <div className={caseOpeningStyles.resultOverline}>
            <span className={caseOpeningStyles.resultOverlineDot} aria-hidden="true" />
            MYST REWARD
          </div>
          <h2 className={caseOpeningStyles.resultHeading}>Yutuq sizniki!</h2>
          <p>Yangi mukofot qo‘lga kiritildi</p>
        </header>

        <div className={caseOpeningStyles.resultVisual}>
          <span className={caseOpeningStyles.resultVisualGlow} aria-hidden="true" />
          <span className={caseOpeningStyles.resultOrbit} aria-hidden="true" />
          <span className={caseOpeningStyles.resultSparkleOne} aria-hidden="true">✦</span>
          <span className={caseOpeningStyles.resultSparkleTwo} aria-hidden="true">✧</span>
          <span className={caseOpeningStyles.resultSparkleThree} aria-hidden="true">✦</span>
          <div className={caseOpeningStyles.resultArtwork}>
            <GiftMedia gift={gift} animate />
          </div>
        </div>

        <div className={caseOpeningStyles.resultCopy}>
          <span className={caseOpeningStyles.resultRarity}>
            {isStars ? 'STARS REWARD' : isXp ? 'LEVEL XP' : rarity.toUpperCase()}
          </span>
          <strong id="case-win-title">{gift.title || 'Reward'}</strong>
          <p id="case-win-description">{isStars ? 'Balansingiz muvaffaqiyatli yangilandi' : rewardSubtitle(gift)}</p>
        </div>

        <div className={caseOpeningStyles.resultStatus}>
          <span className={caseOpeningStyles.resultCheck} aria-hidden="true">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none"
              stroke="currentColor" strokeWidth="2.3" strokeLinecap="round"
              strokeLinejoin="round">
              <path d="M4 10l4 4 8-8"/>
            </svg>
          </span>
          {isStars ? 'Stars balansga qo‘shildi' : isXp ? 'XP hisobingizga qo‘shildi' : 'Mukofot qo‘lga kiritildi'}
        </div>

        <div className={caseOpeningStyles.winActions}>
          <button type="button" className={caseOpeningStyles.winPrimary}
            onClick={onAgain}>Yana ochish
            <span aria-hidden="true">↗</span>
          </button>
          {!isStars && !isXp && (
            <button type="button" className={caseOpeningStyles.winSell}
              onClick={() => onSell(opening)}>{sellButtonText(gift)}</button>
          )}
          <div className={caseOpeningStyles.resultActionRow}>
            {!isXp ? <button type="button" className={caseOpeningStyles.winSecondary}
              onClick={onInventory}>Inventar</button> : null}
            <button type="button" className={caseOpeningStyles.winSecondary}
              onClick={onClose}>Yopish</button>
          </div>
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
  onInventory,
  onAgain,
  soundEnabled,
  helpers,
}) {
  const { GiftMedia, eligibleGift, openableGift, formatPrice, getWinningIndexFromReel,
    caseAccent, caseBadgeColor, solidGiftBackground, defaultGiftBackground, visibleChance } = helpers;
  const cue = useCaseSound(soundEnabled);
  const readyGifts = gifts.filter(eligibleGift);
  const openableGifts = readyGifts.filter(openableGift);
  const isFree = Number(caseItem.price || 0) === 0;
  const openText = isFree ? 'OPEN' : `OPEN ${formatPrice(caseItem.price)}`;
  const previewGifts = readyGifts.length ? readyGifts : gifts;
  const orderedPrizes = sortCasePrizesHighToLow(previewGifts);
  const inlineOpening = opening && String(opening.caseItem?.id) === String(caseItem.id) ? opening : null;
  const isSpinning = inlineOpening && inlineOpening.stage !== 'result';
  const isResult = inlineOpening?.stage === 'result';
  const isOpeningActive = Boolean(inlineOpening);
  const targetIndex =
    typeof inlineOpening?.winningIndex === 'number'
      ? inlineOpening.winningIndex
      : getWinningIndexFromReel(inlineOpening?.reel || []);
  const stripGifts = buildIdlePreviewStrip(previewGifts);

  // Keep global body untouched: a fixed body moves the Telegram balance
  // header and dock. Playback stays in its own surface, with a skip option.
  useEffect(() => {
    if (inlineOpening?.stage === 'rolling') cue('spin');
    if (inlineOpening?.stage === 'result') cue('win');
  }, [inlineOpening?.stage, cue]);


  return (
    <section className={`case-page-screen ${caseOpeningStyles.detailPage} ${isSpinning ? 'is-inline-spinning' : ''} ${isResult ? 'has-inline-result' : ''}`}>
      <div className={`case-page-top ${caseOpeningStyles.detailTop}`}>
        <button type="button" className={`case-page-back ${caseOpeningStyles.detailBack}`}
          onClick={onBack} disabled={isSpinning} aria-label="Case ro‘yxatiga qaytish">←</button>
        <div className={caseOpeningStyles.detailBreadcrumb}><span>THE COLLECTION</span><strong>Case opening</strong></div>
        <span className={caseOpeningStyles.detailTopCount}>{previewGifts.length} ta sovg‘a</span>
      </div>

      <div className={`case-page-hero inline-case-hero ${caseOpeningStyles.detailHero}`}
        style={{'--case-page-accent':caseAccent(caseItem),'--case-page-badge':caseBadgeColor(caseItem)}}>
        <header className={`case-page-copy ${caseOpeningStyles.detailHeading}`}>
          <span className={caseOpeningStyles.detailEyebrow}>MYST / COLLECTIBLE DROP</span>
          <div className={caseOpeningStyles.detailTitleRow}>
            <div><h2>{caseItem.title}</h2><p>{caseItem.description || (isFree ? 'Bepul Case sovg‘alari kolleksiyasi.' : `${previewGifts.length} ta sovg‘adan tasodifiy yutuq.`)}</p></div>
            <span className={caseOpeningStyles.detailPrice}><StarIcon size={15}/> {isFree ? 'FREE' : formatPrice(caseItem.price)}</span>
          </div>
        </header>

        <div className={caseOpeningStyles.detailReelFrame}>
          <div className={caseOpeningStyles.detailReelHeading}>
            <span><i aria-hidden="true"/> MYST ROLL</span><small>MARKAZIY BELGI</small>
          </div>
          <InlineRaffleRoller opening={inlineOpening} idleGifts={stripGifts}
            targetIndex={targetIndex} onRollComplete={onRollComplete} helpers={helpers}/>
        </div>

        {!isFree ? <details className={caseOpeningStyles.detailOdds}>
          <summary>Yutish ehtimollarini ko‘rish <span aria-hidden="true">⌄</span></summary>
          <div className={caseOpeningStyles.detailOddsContent}>
            <p>Reel — animatsiya. Sovg‘aning yutilish ehtimoli quyidagicha:</p>
            <ul>
              {previewGifts.map((gift) => (
                <li key={gift.id}>
                  <span>{gift.title}</span>
                  <strong>{visibleChance(gift)}%</strong>
                </li>
              ))}
            </ul>
          </div>
        </details> : null}

        <button type="button" className={`${caseOpeningStyles.openButton} ${caseOpeningStyles.detailOpen}`}
          disabled={busy || isSpinning || openableGifts.length === 0}
          onClick={() => { cue('open'); onOpen(); }} aria-busy={isSpinning} aria-live="polite">
          <Image src="/currency/case-open-star-3d.png" width={22} height={22}
            className={caseOpeningStyles.casePriceStar} alt="" aria-hidden="true"
            unoptimized draggable={false} />
          <span>{isSpinning ? (inlineOpening.stage === 'preparing' ? 'OPENING' : 'ROLLING') : openText}</span>
        </button>
        {inlineOpening?.stage === 'rolling' && (
          <button type="button" className={caseOpeningStyles.skipAnimation}
            onClick={() => onRollComplete(inlineOpening.spinKey)}>Animatsiyani o‘tkazib yuborish</button>
        )}
      </div>

      {isResult ? (
        <CaseWinResult
          opening={inlineOpening}
          onClose={onCloseResult}
          onSell={onSellResult}
          onInventory={onInventory}
          onAgain={onAgain}
          helpers={helpers}
        />
      ) : null}

      <div className={`case-page-prizes-head ${caseOpeningStyles.detailPrizesHead}`}>
        <div>
          <span className="eyebrow">Inside this case</span>
          <h2>Sovg‘alar</h2>
        </div>
        <strong>{previewGifts.length || 0} ta</strong>
      </div>

      <div className={`case-page-prize-grid ${caseOpeningStyles.detailPrizeGrid}`}>
        {orderedPrizes.map((gift, index) => (
          <div
            className={`case-page-prize-card ${caseOpeningStyles.detailPrizeCard}`}
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
              <span>{gift.type === 'balance' ? 'Stars mukofoti' : gift.type === 'xp' ? 'Level XP' : 'Collectible Gift'}</span>
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

