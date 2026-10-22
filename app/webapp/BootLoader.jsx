import Quantum from './vendor/Quantum';
import LineWobble from './vendor/LineWobble';
import styles from './BootLoader.module.css';

// Animation: UIBall LDRS (MIT). No new generic MYST logo.
export default function BootLoader() {
  return (
    <main className={styles.screen} role="status" aria-live="polite" aria-label="MYST yuklanmoqda">
      <div className={styles.stage} aria-hidden="true">
        <span className={styles.rim} />
        <Quantum size={138} color="#c8bcff" speed={2} />
        <span className={styles.core} />
      </div>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>TELEGRAM MINI APP</span>
        <h1>MYST</h1>
        <p>Yangi tajribaga ulanyapsiz</p>
      </div>
      <div className={styles.progress} aria-hidden="true">
        <LineWobble size={148} stroke={3} color="#ac9bff" speed={1.5} bgOpacity={0.15} />
      </div>
      <footer className={styles.footer}>SECURE CONNECTION <span>·</span> TELEGRAM</footer>
    </main>
  );
}
