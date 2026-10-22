import styles from './BootLoader.module.css';

export default function BootLoader() {
  return (
    <main className={styles.screen} role="status" aria-live="polite" aria-label="Gift Myst yuklanmoqda">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.emblem} aria-hidden="true">
          <span className={styles.emblemGlow} />
          <span className={styles.emblemCore}>✦</span>
          <span className={styles.emblemOrbit} />
        </div>
        <div className={styles.brand}>
          <span className={styles.eyebrow}>TELEGRAM MINI APP</span>
          <h1>GIFT <span>MYST</span></h1>
          <p>Premium experience, thoughtfully crafted.</p>
        </div>
        <div className={styles.progress} aria-hidden="true"><span /></div>
        <div className={styles.status}><span className={styles.statusDot} /> Xavfsiz ulanish o‘rnatilmoqda</div>
      </div>
      <div className={styles.footer}>GIFT MYST <span>•</span> EXPERIENCE</div>
    </main>
  );
}
