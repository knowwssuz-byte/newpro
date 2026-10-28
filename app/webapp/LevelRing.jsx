'use client';
import styles from './LevelRing.module.css';
import {levelProgress} from '@/lib/levelProgress.mjs';
export default function LevelRing({xp=0,compact=false,children}) {
 const v=levelProgress(xp);
 const circ=2*Math.PI*31;
 return <div className={`${styles.wrap} ${compact?styles.compact:''}`}
  aria-label={`Level ${v.level}, ${v.progress}%, keyingi levelgacha ${v.remaining} XP`}
  title={`Level ${v.level}: ${v.current}/${v.needed} XP`}>
  <svg className={styles.ring} viewBox="0 0 72 72" aria-hidden="true">
   <circle className={styles.track} cx="36" cy="36" r="31"/>
   <circle className={styles.progress} cx="36" cy="36" r="31" strokeDasharray={circ}
     strokeDashoffset={circ*(1-v.progress/100)}/>
  </svg>
  <div className={styles.avatar}>{children}</div>
  <span className={styles.level}>LVL {v.level}</span>
 </div>;
}
