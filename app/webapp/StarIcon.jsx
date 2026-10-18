import Image from 'next/image';
import styles from './StarIcon.module.css';

// Every version MUST use the original Telegram Stars artwork.
// "Variants" change only the surrounding light/shadow, never the star shape.
const FINISHES = Object.freeze({
  balance: 'gold',
  classic: 'gold',
  gold: 'gold',
  deposit: 'prism',
  prism: 'prism',
  bonus: 'aurora',
  aurora: 'aurora',
  inventory: 'royal',
  royal: 'royal',
  game: 'nova',
  nova: 'nova',
});

export default function StarIcon({ variant = 'gold', size = 24, className = '' }) {
  const finish = FINISHES[variant] || 'gold';
  const safeSize = Math.max(12, Math.min(128, Number(size) || 24));
  return (
    <Image
      src="/currency/stars.png"
      alt=""
      aria-hidden="true"
      className={[styles.telegramStar, styles[finish], className].filter(Boolean).join(' ')}
      width={safeSize}
      height={safeSize}
      draggable={false}
    />
  );
}
