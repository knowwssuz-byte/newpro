// Vendor port of UIBall LDRS (MIT), JSX + CSS Modules.
// https://github.com/GriffinJohnston/ldrs/tree/main/src/react
import styles from './Quantum.module.css'

const Quantum = ({
  size = 45,
  color = 'black',
  speed = 1.75,
}) => {
  return (
    <div
      className={styles.container}
      style={{
        '--uib-size': size + 'px',
        '--uib-color': color,
        '--uib-speed': speed + 's',
      }}
    >
      <div className={styles.inner}>
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
        <div className={styles.particle} />
      </div>
    </div>
  )
}

export default Quantum
