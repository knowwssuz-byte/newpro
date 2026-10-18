import Image from 'next/image';
import styles from './StarIcon.module.css';

// Two treatments of the authentic Telegram Stars shape:
// gold for balances and rewards; monochrome for decorative/secondary UI.
export default function StarIcon({ variant = 'gold', size = 24, className = '' }) {
  const mono = variant === 'mono' || variant === 'muted' || variant === 'disabled';
  const safeSize = Math.max(12, Math.min(128, Number(size) || 24));
  return (
    <Image
      src="/currency/stars.png"
      alt=""
      aria-hidden="true"
      className={[styles.telegramStar, mono ? styles.mono : styles.gold, className].filter(Boolean).join(' ')}
      width={safeSize}
      height={safeSize}
      draggable={false}
    />
  );
}
