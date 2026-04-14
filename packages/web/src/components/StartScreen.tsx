import { useState } from 'react';
import { CatCharacter } from './CatCharacter';
import styles from './StartScreen.module.css';

interface StartScreenProps {
  onStart: () => Promise<void>;
}

export function StartScreen({ onStart }: StartScreenProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        <h1 className={styles.title}>
          <span className={styles.titleMain}>Demonator</span>
          <span className={styles.titleSub}>웹소설 스무고개</span>
        </h1>
        <div className={styles.character}>
          <CatCharacter size="large" animated />
        </div>
        <p className={styles.description}>
          생각하고 있는 웹소설을 맞춰볼게요!
        </p>
        <button
          className={styles.startButton}
          onClick={handleStart}
          disabled={loading}
        >
          {loading ? '준비 중...' : '시작하기'}
        </button>
        {error && <p className={styles.error}>{error}</p>}
      </div>
    </div>
  );
}
