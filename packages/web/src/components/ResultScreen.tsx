import type { WorkDTO } from '../types/game';
import styles from './ResultScreen.module.css';

interface ResultScreenProps {
  result: 'correct' | 'give_up';
  work: WorkDTO | null;
  totalQuestions: number;
  onRestart: () => void;
}

export function ResultScreen({
  result,
  work,
  totalQuestions,
  onRestart,
}: ResultScreenProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {result === 'correct' && work ? (
          <>
            <div className={styles.successBadge}>정답!</div>
            {work.thumbnailUrl && (
              <img
                className={styles.thumbnail}
                src={work.thumbnailUrl}
                alt={work.title}
              />
            )}
            <h2 className={styles.title}>{work.title}</h2>
            {work.author && (
              <p className={styles.author}>{work.author}</p>
            )}
            <p className={styles.stats}>
              {totalQuestions}개의 질문만에 맞췄어요!
            </p>
          </>
        ) : (
          <>
            <div className={styles.failBadge}>아쉬워요...</div>
            <p className={styles.failMessage}>
              이번에는 맞추지 못했어요.
              <br />
              다음에 다시 도전해 주세요!
            </p>
          </>
        )}
        <button className={styles.restartButton} onClick={onRestart}>
          다시 하기
        </button>
      </div>
    </div>
  );
}
