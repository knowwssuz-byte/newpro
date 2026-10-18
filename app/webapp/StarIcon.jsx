import Image from 'next/image';

const TYPES = Object.freeze({
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
  const finish = TYPES[variant] || TYPES.gold;
  return (
    <Image
      src={`/currency/stars-${finish}.svg`}
      alt=""
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      draggable={false}
      unoptimized
    />
  );
}
