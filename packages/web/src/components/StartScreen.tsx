import { useState } from 'react';
import styles from './StartScreen.module.css';

interface StartScreenProps {
  onStart: () => Promise<void>;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hovered, setHovered] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    setError(null);
    try {
      await onStart();
    } catch (e) {
      const msg = e instanceof Error ? e.message : '알 수 없는 오류';
      setError(`서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해 주세요.\n(${msg})`);
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.content}>
        <h1 className={styles.title}>RIDINATOR</h1>

        <div
          className={styles.interactiveArea}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          <span className={styles.subtitle}>무엇이든 찾아준다냥</span>

          <div className={styles.characterWrap}>
            <img
              src={hovered ? '/assets/ridinator-hover.png' : '/assets/ridinator-idle.png'}
              alt="리디네이터"
              className={styles.characterImg}
              draggable={false}
            />
          </div>

          <div className={`${styles.buttonWrap} ${hovered ? styles.buttonVisible : ''}`}>
            <button
              className={styles.startButton}
              onClick={handleStart}
              disabled={loading}
            >
              {loading ? '준비 중...' : '시작하기'}
            </button>
          </div>
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
