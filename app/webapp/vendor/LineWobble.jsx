// Vendor port of UIBall LDRS (MIT), JSX + CSS Modules.
// https://github.com/GriffinJohnston/ldrs/tree/main/src/react
import styles from './LineWobble.module.css'

const LineWobble = ({
  size = 80,
  color = 'black',
  speed = 1.75,
  stroke = 5,
  bgOpacity = 0.1,
}) => {
  return (
    <div
      className={styles.container}
      style={{
        '--uib-size': size + 'px',
        '--uib-color': color,
        '--uib-speed': speed + 's',
        '--uib-stroke': stroke + 'px',
        '--uib-bg-opacity': bgOpacity + '',
      }}
    >
      <div className={styles.inner} />
    </div>
  )
}

export default LineWobble
