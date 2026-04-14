import styles from './CatCharacter.module.css';

interface CatCharacterProps {
  size?: 'large' | 'medium';
  animated?: boolean;
}

export function CatCharacter({ size = 'medium', animated = false }: CatCharacterProps) {
  return (
    <div className={`${styles.cat} ${styles[size]} ${animated ? styles.animated : ''}`}>
      <div className={styles.ears}>
        <div className={`${styles.ear} ${styles.left}`} />
        <div className={`${styles.ear} ${styles.right}`} />
      </div>
      <div className={styles.face}>
        <div className={styles.eyes}>
          <div className={`${styles.eye} ${styles.left}`}>
            <div className={styles.pupil} />
          </div>
          <div className={`${styles.eye} ${styles.right}`}>
            <div className={styles.pupil} />
          </div>
        </div>
        <div className={styles.nose} />
        <div className={styles.mouth} />
        <div className={styles.whiskers}>
          <div className={`${styles.whisker} ${styles.wLeft1}`} />
          <div className={`${styles.whisker} ${styles.wLeft2}`} />
          <div className={`${styles.whisker} ${styles.wRight1}`} />
          <div className={`${styles.whisker} ${styles.wRight2}`} />
        </div>
      </div>
    </div>
  );
}
