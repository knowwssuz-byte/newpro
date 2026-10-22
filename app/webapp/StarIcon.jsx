import Image from 'next/image';
import styles from './StarIcon.module.css';

// Monetary balance: existing Telegram Stars art. Other contexts: Tabler MIT SVG symbols.
// The supporting Tabler artwork is NOT represented as official Telegram branding.
const ASSETS = Object.freeze({
  gold: '/currency/stars.png',
  balance: '/currency/stars.png',
  mono: '/currency/stars-outline-tabler.svg',
  muted: '/currency/stars-outline-tabler.svg',
  disabled: '/currency/stars-outline-tabler.svg',
  prism: '/currency/stars-cluster-tabler.svg',
  aurora: '/currency/stars-sparkles-tabler.svg',
  reward: '/currency/stars-sparkles-tabler.svg',
  badge: '/currency/star-badge-tabler.svg',
  royal: '/currency/star-badge-tabler.svg',
});
export default function StarIcon({ variant = 'gold', size = 24, className = '' }) {
  const safeSize = Math.max(12, Math.min(128, Number(size) || 24));
  const src = ASSETS[variant] || ASSETS.gold;
  const treatment = src.endsWith('.png')
    ? styles.gold
    : ['mono', 'muted', 'disabled'].includes(variant) ? styles.mono : styles.vector;
  return (
    <Image src={src} width={safeSize} height={safeSize}
      alt="" aria-hidden="true" draggable={false} unoptimized
      className={[styles.telegramStar, treatment, className].filter(Boolean).join(' ')} />
  );
}
