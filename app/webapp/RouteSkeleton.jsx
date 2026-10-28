import styles from './RouteSkeleton.module.css';

// Route-level fallback: the global header / navigation stay interactive.
export default function RouteSkeleton({ title = 'Sahifa ochilmoqda' }) {
  return <section className={styles.root} role="status" aria-label={title}>
    <div className={styles.hero}><span className={styles.orb} aria-hidden="true" /></div>
    <div className={styles.rows}>
      <div className={styles.row} />
      <div className={styles.row} />
    </div>
  </section>;
}
