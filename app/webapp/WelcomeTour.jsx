'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import AppIcon from './AppIcon';
import styles from './WelcomeTour.module.css';

const SCREENS = [
  {
    step: '01',
    label: 'Kirish',
    title: 'Gift Myst’ga',
    emphasis: 'xush kelibsiz.',
    description: 'Caselarni kashf eting, sovg‘alar to‘plang va inventaringizni boshqaring.',
    image: '/onboarding/welcome-gift-v2.webp',
    alt: 'Binafsha rang sovg‘a qutisi va kristallar',
  },
  {
    step: '02',
    label: 'Caselar',
    title: 'Caselarni oching.',
    emphasis: 'Omadingizni sinang.',
    description: 'Turli caselar va tasodifiy sovg‘alar. Yutuqlar kafolatlanmaydi.',
    image: '/onboarding/welcome-case-v2.webp',
    alt: 'Ichida yorqin kristall bor ochiq sovg‘a case’i',
  },
  {
    step: '03',
    label: 'Inventar',
    title: 'Sovg‘alaringiz',
    emphasis: 'bir joyda.',
    description: 'Giftlarni kuzating, soting yoki o‘tkazish uchun so‘rov yuboring.',
    image: '/onboarding/welcome-inventory-v2.webp',
    alt: 'Sovg‘alar tasvirlangan uchta kolleksiya kartasi',
  },
];

export default function WelcomeTour({ onFinish }) {
  const [index, setIndex] = useState(0);
  const skipRef = useRef(null);
  const touchStart = useRef(null);
  const slide = SCREENS[index];
  const isLast = index === SCREENS.length - 1;

  useEffect(() => {
    skipRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') onFinish?.();
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((n) => Math.min(SCREENS.length - 1, n + 1));
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((n) => Math.max(0, n - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFinish]);

  useEffect(() => {
    const nextArtwork = SCREENS[index + 1]?.image;
    if (!nextArtwork) return;
    const img = new window.Image();
    img.decoding = 'async';
    img.src = nextArtwork;
    img.decode?.().catch(() => {});
  }, [index]);

  const onSwipeEnd = (event) => {
    const start = touchStart.current;
    touchStart.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    setIndex((n) => Math.max(0, Math.min(SCREENS.length - 1, n + (dx < 0 ? 1 : -1))));
  };

  return (
    <main className={styles.page} aria-label="MYST tanishtiruv" data-myst-intro="true">
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <span className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true"><AppIcon name="gift" /></span>
            <span>GIFT MYST</span>
          </span>
          <button
            type="button"
            className={styles.skip}
            ref={skipRef}
            aria-label="Tanishtiruvni o‘tkazib yuborish"
            onClick={() => onFinish?.()}
          >
            O‘tkazish <AppIcon name="chevronRight" />
          </button>
        </header>

        <div
          className={styles.body}
          onTouchStart={(event) => {
            const touch = event.touches[0];
            if (touch) touchStart.current = { x: touch.clientX, y: touch.clientY };
          }}
          onTouchEnd={onSwipeEnd}
          onTouchCancel={() => { touchStart.current = null; }}
        >
          <section
            className={styles.copy}
            key={slide.step}
            aria-live="polite"
            aria-atomic="true"
            aria-labelledby="giftmyst-welcome-title"
          >
            <span className={styles.eyebrow}>{slide.label} <span aria-hidden="true">/</span> {slide.step} / 03</span>
            <h1 id="giftmyst-welcome-title">
              <span className={styles.titleMain}>{slide.title}</span>
              <span className={styles.titleAccent}>{slide.emphasis}</span>
            </h1>
            <p>{slide.description}</p>
          </section>

          <div className={styles.artwork} key={slide.image}>
            <div className={styles.artworkFrame}>
              <span className={styles.artworkGlow} aria-hidden="true" />
              <span className={styles.artworkRing} aria-hidden="true" />
              <Image
                src={slide.image}
                alt={slide.alt}
                className={styles.heroImage}
                width={768}
                height={768}
                unoptimized
                priority={index === 0}
                draggable={false}
              />
            </div>
          </div>
        </div>

        <footer className={styles.footer}>
          <nav className={styles.dots} aria-label="Tanishtiruv bosqichlari">
            {SCREENS.map((screen, i) => (
              <button
                key={screen.step}
                type="button"
                aria-label={screen.step + '-bosqich: ' + screen.label}
                aria-current={i === index ? 'step' : undefined}
                className={i === index ? styles.activeDot : ''}
                onClick={() => setIndex(i)}
              >
                <span className={styles.progressTrack} />
              </button>
            ))}
          </nav>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.back}
              aria-label="Oldingi bosqich"
              disabled={index === 0}
              onClick={() => setIndex((n) => Math.max(0, n - 1))}
            >
              <AppIcon name="chevronLeft" />
              <span>Orqaga</span>
            </button>
            <button
              type="button"
              className={styles.next}
              onClick={() => isLast ? onFinish?.() : setIndex((n) => Math.min(SCREENS.length - 1, n + 1))}
            >
              <span>{isLast ? 'Boshlash' : 'Keyingisi'}</span>
              <AppIcon name="chevronRight" />
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
