'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import AppIcon from './AppIcon';
import StarIcon from './StarIcon';
import styles from './WelcomeTour.module.css';

const SCREENS = [
  {
    step: '01',
    eyebrow: 'XUSH KELIBSIZ',
    title: 'Gift Myst olamiga',
    emphasis: 'xush kelibsiz',
    description: 'Caselarni ko‘ring, o‘yinlar bilan tanishing va shaxsiy inventaringizni boshqaring.',
    image: '/onboarding/welcome-gift-v2.webp',
    label: 'Kirish',
    badge: 'Gift kolleksiyasi',
    badgeIcon: 'gift',
    detail: 'Sizning yangi olamingiz',
    points: [{ icon: 'games', text: 'Games va Caselar' }, { icon: 'gift', text: 'Inventardagi sovg‘alar' }, { icon: 'globe', text: 'Qulay mobil interfeys' }],
  },
  {
    step: '02',
    eyebrow: 'CASELAR',
    title: 'Caselarni oching va',
    emphasis: 'sovg‘alarni yuting',
    description: 'Case kolleksiyasini kashf eting. Natijalar tasodifiy — yutuqlar kafolatlanmaydi.',
    image: '/onboarding/welcome-case-v2.webp',
    label: 'Caselar',
    badge: 'Case kolleksiyasi',
    badgeIcon: 'cases',
    detail: 'Har bir case — yangi taassurot',
    points: [{ icon: 'cases', text: 'Turli xil case kolleksiyasi' }, { icon: 'gem', text: 'Gift va Stars yutuqlari' }, { icon: 'box', text: 'Chiroyli ochilish animatsiyasi' }],
  },
  {
    step: '03',
    eyebrow: 'INVENTAR',
    title: 'Inventaringizni',
    emphasis: 'boshqaring',
    description: 'Qo‘lga kiritilgan giftlarni ko‘ring, soting yoki o‘tkazish uchun so‘rov yuboring.',
    image: '/onboarding/welcome-inventory-v2.webp',
    label: 'Inventar',
    badge: 'Shaxsiy kolleksiya',
    badgeIcon: 'inventory',
    detail: 'Barcha giftlar bir joyda',
    points: [{ icon: 'inventory', text: 'Barcha giftlar bir joyda' }, { icon: 'send', text: 'Sotish va o‘tkazish so‘rovi' }, { icon: 'coin', text: 'Stars balansini kuzatish' }],
  },
];

export default function WelcomeTour({ onFinish }) {
  const [index, setIndex] = useState(0);
  const skipRef = useRef(null);
  const dialogRef = useRef(null);
  const slide = SCREENS[index];
  const isLast = index === SCREENS.length - 1;

  useEffect(() => {
    // Decoding the next onboarding slide before a tap avoids a blank hero swap.
    const nextArtwork = SCREENS[index + 1]?.image;
    if (!nextArtwork) return;
    const img = new window.Image();
    img.loading = 'eager';
    img.decoding = 'async';
    img.fetchPriority = 'low';
    img.src = nextArtwork;
    img.decode?.().catch(() => {});
  }, [index]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    skipRef.current?.focus({ preventScroll: true });

    const onKey = (event) => {
      if (event.key === 'Tab') {
        const buttons = dialogRef.current?.querySelectorAll('button:not(:disabled)');
        if (!buttons?.length) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (!dialogRef.current.contains(document.activeElement)) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        } else if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
      if (event.key === 'Escape') onFinish?.();
      if (event.key === 'ArrowRight') setIndex((value) => Math.min(SCREENS.length - 1, value + 1));
      if (event.key === 'ArrowLeft') setIndex((value) => Math.max(0, value - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
      if (previousFocus?.isConnected) previousFocus.focus?.({ preventScroll: true });
    };
  }, [onFinish]);

  return (
    <div className={styles.overlay} role="presentation">
      <section ref={dialogRef} className={styles.sheet} role="dialog" aria-modal="true"
        aria-labelledby="giftmyst-welcome-title" aria-describedby="giftmyst-welcome-description">
        <div className={styles.topbar}>
          <span className={styles.brand}>
            <span className={styles.brandMark}><AppIcon name="gift" /></span>
            <span>GIFT MYST<small>GIFT COLLECTION</small></span>
          </span>
          <button type="button" className={styles.skip} ref={skipRef} aria-label="Tanishtiruvni o‘tkazib yuborish" onClick={onFinish}>
            Skip <AppIcon name="chevronRight" />
          </button>
        </div>

        <div className={styles.hero} key={'hero-' + slide.step}>
          <span className={styles.heroGlow} aria-hidden="true" />
          <span className={styles.heroOrbit} aria-hidden="true" />
          <div className={styles.imageFrame}>
            <Image src={slide.image} alt="" className={styles.heroImage} width={768} height={768}
              unoptimized loading="eager" fetchPriority={index === 0 ? 'high' : 'auto'} draggable={false} />
          </div>
          <span className={styles.heroBadge} aria-hidden="true"><AppIcon name={slide.badgeIcon} />{slide.badge}</span>
          <span className={styles.starsBadge} aria-hidden="true"><StarIcon size={22} /><span>Telegram<small>Stars</small></span></span>
          <span className={styles.glowDot} aria-hidden="true" />
          <span className={styles.heroCaption} aria-hidden="true">{slide.detail}</span>
        </div>

        <div className={styles.copy} key={slide.step} aria-live="polite" aria-atomic="true">
          <span className={styles.eyebrow}>{slide.eyebrow} <span>·</span> {slide.step} / 03</span>
          <h2 id="giftmyst-welcome-title">
            <span className={styles.titleMain}>{slide.title}</span>
            <span className={styles.titleAccent}>{slide.emphasis}</span>
          </h2>
          <p id="giftmyst-welcome-description">{slide.description}</p>
          <ul className={styles.points}>
            {slide.points.map((point) => (
              <li key={point.text}><span className={styles.pointIcon}><AppIcon name={point.icon} /></span><span>{point.text}</span></li>
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
              ><span className={styles.progressTrack} /><span>{screen.label}</span></button>
            ))}
          </div>
          <div className={styles.actions}>
          {index > 0 && <button type="button" className={styles.back} aria-label="Oldingi bosqich" onClick={() => setIndex((value) => Math.max(0, value - 1))}><AppIcon name="chevronLeft" /></button>}
          <button type="button" className={styles.next} onClick={() => isLast ? onFinish?.() : setIndex((value) => Math.min(SCREENS.length - 1, value + 1))}>
            <span>{isLast ? 'Boshlash' : 'Keyingisi'}</span>
            <AppIcon name="chevronRight" />
          </button>
          </div>
        </div>
      </section>
    </div>
  );
}
