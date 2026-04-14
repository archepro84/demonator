import type { ReactNode } from 'react';
import styles from './SpeechBubble.module.css';

interface SpeechBubbleProps {
  children: ReactNode;
}

export function SpeechBubble({ children }: SpeechBubbleProps) {
  return (
    <div className={styles.bubble}>
      <div className={styles.tail} />
      <div className={styles.content}>{children}</div>
    </div>
  );
}
