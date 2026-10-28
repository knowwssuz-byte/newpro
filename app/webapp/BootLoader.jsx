import styles from './BootLoader.module.css';

export default function BootLoader({ error = '', onRetry }) {
  return (
    <main className={styles.screen} role="status" aria-live="polite"
      aria-label={error ? 'MYST yuklashda muammo' : 'MYST yuklanmoqda'}>
      <div className={styles.center}>
        <div className={styles.identity} aria-hidden="true">
          <span className={styles.wordmark} data-text="MYST">MYST</span>
          <span className={styles.accent} />
        </div>
        {error ? (
          <div className={styles.error} role="alert">
            <p>{error}</p>
            <button type="button" onClick={onRetry}>Qayta urinish</button>
          </div>
        ) : (
          <div className={styles.progress} aria-hidden="true"><span className={styles.beam} /></div>
        )}
      </div>
    </main>
  );
}
