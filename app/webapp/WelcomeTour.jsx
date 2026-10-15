'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './WelcomeTour.module.css';

const SCREENS = [
  {
    step: '01',
    eyebrow: 'XUSH KELIBSIZ',
    title: 'Gift Myst olamiga xush kelibsiz',
    description: 'Caselarni ko‘ring, o‘yinlar bilan tanishing va shaxsiy inventaringizni boshqaring.',
    symbol: '✦',
    points: ['Games va Caselar', 'Inventardagi sovg‘alar', 'Qulay mobil interfeys'],
  },
  {
    step: '02',
    eyebrow: 'IMKONIYATLAR',
    title: 'Bonuslar va do‘stlar',
    description: 'Bonus vazifalarini bajaring, referal havolangizni ulashing va har bir natijani profilingizda ko‘ring.',
    symbol: '◇',
    points: ['Tekshiriladigan bonuslar', 'Referal statistikasi', 'Bajarilgan vazifalar'],
  },
  {
    step: '03',
    eyebrow: 'XAVFSIZ FOYDALANISH',
    title: 'Balans va qoidalar',
    description: 'Depozitni tasdiqlashdan oldin summani tekshiring. O‘yinlar tavakkalchilikni o‘z ichiga oladi, natijalar kafolatlanmaydi.',
    symbol: '◎',
    points: ['To‘lov tarixini tekshiring', 'Promokod va limitlarni kuzating', 'Savol bo‘lsa yordam so‘rang'],
  },
];

export default function WelcomeTour({ onFinish }) {
  const [index, setIndex] = useState(0);
  const skipRef = useRef(null);
  const slide = SCREENS[index];

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });
    const handleEscape = (event) => {
      if (event.key === 'Escape') onFinish?.();
    };
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [onFinish]);

  return (
    <div className={styles.overlay} role="presentation">
      <section className={styles.sheet} role="dialog" aria-modal="true"
        aria-labelledby="welcome-title" aria-describedby="welcome-description">
        <div className={styles.topbar}>
          <span className={styles.brand}><span className={styles.brandMark}>✦</span> GIFT MYST</span>
          <button type="button" className={styles.skip} ref={skipRef} onClick={onFinish}>
            Skip <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.ringOuter} />
          <span className={styles.ringInner} />
          <span className={styles.orb}>{slide.symbol}</span>
          <span className={styles.starLeft}>✧</span>
          <span className={styles.starRight}>✦</span>
        </div>
        <div className={styles.copy} key={slide.step}>
          <span className={styles.eyebrow}>{slide.eyebrow} · {slide.step} / 03</span>
          <h2 id="welcome-title">{slide.title}</h2>
          <p id="welcome-description">{slide.description}</p>
          <ul className={styles.points}>
            {slide.points.map((point) => <li key={point}><span>✓</span>{point}</li>)}
          </ul>
        </div>
        <div className={styles.footer}>
          <div className={styles.dots} aria-label="Tanishtiruv bosqichlari">
            {SCREENS.map((item, i) => (
              <button key={item.step} type="button" aria-label={`${i + 1}-bosqich`}
                aria-current={i === index ? 'step' : undefined}
                className={i === index ? styles.activeDot : ''}
                onClick={() => setIndex(i)} />
            ))}
          </div>
          <button type="button" className={styles.next}
            onClick={() => index === SCREENS.length - 1 ? onFinish?.() : setIndex(index + 1)}>
            {index === SCREENS.length - 1 ? 'Boshlash' : 'Keyingisi'}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </section>
    </div>
  );
}
