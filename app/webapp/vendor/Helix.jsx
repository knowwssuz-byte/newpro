// Vendor port of UIBall LDRS (MIT), JSX + CSS Modules.
// https://github.com/GriffinJohnston/ldrs/tree/main/src/react
import styles from './Helix.module.css'

const Helix = ({
  size = 45,
  color = 'black',
  speed = 2.5,
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
        <div className={styles.slice} />
        <div className={styles.slice} />
        <div className={styles.slice} />
        <div className={styles.slice} />
        <div className={styles.slice} />
        <div className={styles.slice} />
      </div>
    </div>
  )
}
export default Helix
