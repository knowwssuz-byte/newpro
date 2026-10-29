'use client';
import Image from 'next/image';
import styles from './DiceGame.module.css';

// First-view card has no dependency on the dice game's animation and physics.
export default function DiceLobbyCard({onClick}) {
  return <button type="button" className={styles.lobbyCard} onClick={onClick} aria-label="Dice o‘yinini ochish">
    <span className={styles.lobbyGlow} aria-hidden="true" />
    <span className={styles.lobbyGrid} aria-hidden="true" />
    <span className={styles.lobbyCopy}>
      <span className={styles.lobbyBadge}><i /> YANGI O‘YIN</span>
      <strong>DICE</strong>
      <small>Chegarani tanlang. Omadingizni sinang.</small>
      <span className={styles.lobbyAction}>O‘ynash <b>›</b></span>
    </span>
    <span className={styles.lobbyArt} aria-hidden="true">
      <span className={styles.lobbyOrbit} />
      <Image src="/feature/dice/dice-logo.png" alt="" width={768} height={768}
        sizes="(max-width:590px) 44vw, 230px" draggable={false} />
    </span>
    <span className={styles.lobbyOdds} aria-hidden="true"><em>x1.94</em><em>x3.23</em></span>
  </button>;
}
