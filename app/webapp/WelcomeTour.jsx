'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './WelcomeTour.module.css';

const SCREENS = [
  {
    step: '01',
    eyebrow: 'XUSH KELIBSIZ',
    title: 'Gift Myst olamiga',
    emphasis: 'xush kelibsiz',
    description: 'Caselarni ko‘ring, o‘yinlar bilan tanishing va shaxsiy inventaringizni boshqaring.',
    image: '/onboarding/welcome-1.svg',
    points: ['Games va Caselar', 'Inventardagi sovg‘alar', 'Qulay mobil interfeys'],
  },
  {
    step: '02',
    eyebrow: 'CASELAR',
    title: 'Caselarni oching va',
    emphasis: 'sovg‘alarni yuting',
    description: 'Case kolleksiyasini kashf eting. Natijalar tasodifiy — yutuqlar kafolatlanmaydi.',
    image: '/onboarding/welcome-2.svg',
    points: ['Turli xil case kolleksiyasi', 'Gift va Stars yutuqlari', 'Chiroyli ochilish animatsiyasi'],
  },
  {
    step: '03',
    eyebrow: 'INVENTAR',
    title: 'Inventaringizni osongina',
    emphasis: 'boshqaring',
    description: 'Qo‘lga kiritilgan giftlarni ko‘ring, soting yoki o‘tkazish uchun so‘rov yuboring.',
    image: '/onboarding/welcome-3.svg',
    points: ['Barcha giftlar bir joyda', 'Sotish va o‘tkazish so‘rovi', 'Stars balansini kuzatish'],
  },
];

export default function WelcomeTour({ onFinish }) {
  const [index, setIndex] = useState(0);
  const skipRef = useRef(null);
  const slide = SCREENS[index];
  const isLast = index === SCREENS.length - 1;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key === 'Escape') onFinish?.();
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(SCREENS.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [onFinish]);

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.sheet} role="dialog" aria-modal="true"
        aria-labelledby="giftmyst-welcome-title" aria-describedby="giftmyst-welcome-description">
        <div className={styles.topbar}>
          <span className={styles.brand}>
            <span className={styles.brandMark} aria-hidden="true">✦</span>
            GIFT MYST
          </span>
          <button type="button" className={styles.skip} ref={skipRef} onClick={onFinish}>
            O‘tkazib yuborish <span aria-hidden="true">↗</span>
          </button>
        </div>

        <div className={styles.hero} key={'hero-' + slide.step}>
          <span className={styles.heroGlow} aria-hidden="true" />
          <span className={styles.heroOrbit} aria-hidden="true" />
          <img src={slide.image} alt="" className={styles.heroImage} draggable="false" />
          <span className={styles.glowDot} aria-hidden="true" />
          <span className={styles.starSparkle} aria-hidden="true">✧</span>
        </div>

        <div className={styles.copy} key={slide.step}>
          <span className={styles.eyebrow}>{slide.eyebrow} <span>·</span> {slide.step} / 03</span>
          <h2 id="giftmyst-welcome-title">
            <span className={styles.titleMain}>{slide.title}</span>
            <span className={styles.titleAccent}>{slide.emphasis}</span>
          </h2>
          <p id="giftmyst-welcome-description">{slide.description}</p>
          <ul className={styles.points}>
            {slide.points.map((point) => (
              <li key={point}><span className={styles.tick} aria-hidden="true">✓</span>{point}</li>
            ))}
          </ul>
        </div>

        <div className={styles.footer}>
          <div className={styles.dots} aria-label="Tanishtiruv bosqichlari">
            {SCREENS.map((screen, i) => (
              <button
                key={screen.step}
                type="button"
                aria-label={i + 1 + '-bosqichga o‘tish'}
                aria-current={i === index ? 'step' : undefined}
                className={i === index ? styles.activeDot : ''}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <button type="button" className={styles.next} onClick={() => isLast ? onFinish?.() : setIndex((value) => value + 1)}>
            <span>{isLast ? 'Boshlash' : 'Keyingisi'}</span>
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
