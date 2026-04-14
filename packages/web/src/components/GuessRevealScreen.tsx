import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CatCharacter } from './CatCharacter';
import { SpeechBubble } from './SpeechBubble';
import type { WorkDTO } from '../types/game';
import styles from './GuessRevealScreen.module.css';

interface GuessRevealScreenProps {
  work: WorkDTO;
  questionNumber: number;
  onContinue: () => Promise<void>;
  onRestart: () => void;
}

const BEAM_COUNT = 100;
const SHOCKWAVE_DELAYS = [100, 800, 1500];
const BLACKOUT_HOLD = 1000;

export function GuessRevealScreen({
  work,
  questionNumber,
  onContinue,
  onRestart,
}: GuessRevealScreenProps) {
  const [showFooter, setShowFooter] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [loading, setLoading] = useState(false);

  const shockwavesRef = useRef<HTMLDivElement>(null);
  const timersRef = useRef<number[]>([]);

  const addTimer = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(() => {
    addTimer(() => {
      setShaking(true);
      addTimer(() => setShaking(false), 600);
    }, BLACKOUT_HOLD);

    SHOCKWAVE_DELAYS.forEach((delay) => {
      addTimer(() => {
        const wave = document.createElement('div');
        wave.className = styles.shockwave!;
        shockwavesRef.current?.appendChild(wave);
        wave.addEventListener('animationend', () => wave.remove());
      }, BLACKOUT_HOLD + delay);
    });

    addTimer(() => setShowFooter(true), BLACKOUT_HOLD + 4500);

    return () => {
      timersRef.current.forEach(clearTimeout);
    };
  }, [addTimer]);

  const beams = useMemo(
    () =>
      Array.from({ length: BEAM_COUNT }, (_, i) => (
        <div
          key={i}
          className={styles.beam}
          style={{
            '--angle': `${(i * 360) / BEAM_COUNT + Math.random() * 3}deg`,
            animationDelay: `${(i / BEAM_COUNT) * -1.5}s`,
          } as React.CSSProperties}
        />
      )),
    [],
  );

  const handleContinue = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await onContinue();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`${styles.scene} ${shaking ? styles.shakeScene : ''}`}>
      <div className={styles.blackout} />

      <div
        className={`${styles.effectsOverlay} ${styles.bgAndBeams} ${styles.effectsOverlayActive}`}
        style={
          showFooter
            ? { transition: 'opacity 2s ease', opacity: 0.2 }
            : undefined
        }
      >
        <div className={styles.lightBeams}>{beams}</div>
      </div>

      <div
        className={`${styles.effectsOverlay} ${styles.shockwavesLayer} ${styles.effectsOverlayActive}`}
        style={
          showFooter
            ? { transition: 'opacity 2s ease', opacity: 0 }
            : undefined
        }
      >
        <div ref={shockwavesRef} className={styles.shockwaves} />
      </div>

      <div className={`${styles.cardWrapper} ${styles.revealingWrapper}`}>
        <div className={`${styles.card} ${styles.revealingCard}`}>
          <div className={`${styles.cardFace} ${styles.cardFront}`}>
            {work.thumbnailUrl && (
              <img
                className={styles.cardThumbnail}
                src={work.thumbnailUrl}
                alt={work.title}
              />
            )}
            <h2 className={styles.cardTitle}>{work.title}</h2>
            {work.author && (
              <p className={styles.cardAuthor}>{work.author}</p>
            )}
          </div>
          <div className={`${styles.cardFace} ${styles.cardBack}`}>
            <img
              src="/assets/card-back.png"
              alt=""
              className={styles.cardBackImage}
              draggable={false}
            />
          </div>
        </div>
      </div>

      <div
        className={`${styles.revealFooter} ${showFooter ? styles.revealFooterVisible : ''}`}
      >
        <p className={styles.stats}>
          {questionNumber}개의 질문 후 추측했어요!
        </p>
        <div className={styles.guessFooter}>
          <CatCharacter size="medium" />
          <SpeechBubble>
            <p className={styles.guessMessage}>
              혹시....
              <br />
              이 작품이 아닌가요?
            </p>
          </SpeechBubble>
        </div>
        <div className={styles.guessButtons}>
          <button
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={handleContinue}
            disabled={loading}
          >
            이어하기
          </button>
          <button
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onRestart}
            disabled={loading}
          >
            처음부터
          </button>
        </div>
      </div>
    </div>
  );
}
