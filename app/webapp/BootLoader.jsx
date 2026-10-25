import styles from './BootLoader.module.css';

// The artwork is shared with onboarding: the first reveal reuses the decoded image.
export default function BootLoader() {
  return (
    <main className={styles.screen} role="status" aria-live="polite" aria-label="MYST yuklanmoqda">
      <div className={styles.ambient} aria-hidden="true" />
      <div className={styles.content}>
        <div className={styles.identity} aria-hidden="true">
          <span className={styles.identityDot} />
          <span>GIFT MYST <i>·</i> MINI APP</span>
        </div>
        <div className={styles.artwork} aria-hidden="true">
          <div className={styles.artworkGlow} />
          <img src="/onboarding/welcome-gift-v2.webp" width="220" height="220"
            alt="" loading="eager" decoding="async" fetchPriority="high" draggable="false" />
        </div>
        <div className={styles.copy}>
          <h1>MYST<span className={styles.fullStop}>.</span></h1>
          <p>Sovg‘alar olamiga xush kelibsiz</p>
        </div>
        <div className={styles.progress}>
          <div className={styles.progressHeader}>
            <span><i className={styles.pulse} /> Ilova tayyorlanmoqda</span>
            <span>TELEGRAM</span>
          </div>
          <div className={styles.track} aria-hidden="true"><span className={styles.indicator} /></div>
          <span className={styles.progressNote}>Xavfsiz ulanish va ma’lumotlar yuklanmoqda</span>
        </div>
      </div>
      <footer className={styles.footer}><span>POWERED BY MYST</span><span>SECURE MINI APP</span></footer>
    </main>
  );
}
