'use client';
import Image from 'next/image';
import {ArrowRight} from 'lucide-react';
import styles from './PvpHub.module.css';

// Lightweight Home/Games entry point. The entire multiplayer game bundle is
// loaded only when the player actually enters the PvP section.
export default function PvpEntryCard({onClick}) {
  return <button type="button" className={styles.entryCard} onClick={onClick}>
    <span className={styles.entryIcon}>
      <Image src="/feature/pvp-xo-card-hd.webp" alt="" width={160} height={160}
        sizes="104px" className={styles.entryArtwork} />
    </span>
    <span className={styles.entryText}>
      <strong>PvP Arena</strong>
      <small>O‘yinlarni tanlash</small>
    </span>
    <ArrowRight size={18} aria-hidden="true"/>
  </button>;
}
