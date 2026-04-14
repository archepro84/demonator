import { useCallback, useState } from 'react';
import { StartScreen } from './components/StartScreen';
import { GameScreen } from './components/GameScreen';
import { ResultScreen } from './components/ResultScreen';
import { startGame, submitAnswer, submitGuessResponse } from './api/game';
import type { QuestionDTO, WorkDTO, Answer } from './types/game';
import styles from './App.module.css';

type Screen = 'start' | 'game' | 'result';

interface GameState {
  sessionId: string;
  currentQuestion: QuestionDTO | null;
  currentGuess: { work: WorkDTO; confidence: number } | null;
  questionNumber: number;
  remainingCandidates: number;
  result: 'correct' | 'give_up' | null;
  guessedWork: WorkDTO | null;
  totalQuestions: number;
}

const INITIAL_GAME_STATE: GameState = {
  sessionId: '',
  currentQuestion: null,
  currentGuess: null,
  questionNumber: 0,
  remainingCandidates: 0,
  result: null,
  guessedWork: null,
  totalQuestions: 0,
};

export default function App() {
  const [screen, setScreen] = useState<Screen>('start');
  const [game, setGame] = useState<GameState>(INITIAL_GAME_STATE);

  const handleStart = useCallback(async () => {
    const res = await startGame();
    setGame({
      ...INITIAL_GAME_STATE,
      sessionId: res.sessionId,
      currentQuestion: res.question,
      questionNumber: res.questionNumber,
      remainingCandidates: res.totalWorks,
    });
    setScreen('game');
  }, []);

  const handleAnswer = useCallback(
    async (answer: Answer) => {
      const res = await submitAnswer(game.sessionId, answer);

      if (res.type === 'question') {
        setGame((prev) => ({
          ...prev,
          currentQuestion: res.question,
          currentGuess: null,
          questionNumber: res.questionNumber,
          remainingCandidates: res.remainingCandidates,
        }));
      } else {
        setGame((prev) => ({
          ...prev,
          currentQuestion: null,
          currentGuess: res.guess,
          questionNumber: res.questionNumber,
        }));
      }
    },
    [game.sessionId],
  );

  const handleGuessResponse = useCallback(
    async (correct: boolean) => {
      const res = await submitGuessResponse(game.sessionId, correct);

      if (res.result === 'correct') {
        setGame((prev) => ({
          ...prev,
          result: 'correct',
          guessedWork: prev.currentGuess?.work ?? null,
          totalQuestions: res.totalQuestions,
        }));
        setScreen('result');
      } else if (res.result === 'give_up') {
        setGame((prev) => ({
          ...prev,
          result: 'give_up',
          totalQuestions: res.totalQuestions,
        }));
        setScreen('result');
      } else {
        if (res.nextGuess) {
          setGame((prev) => ({
            ...prev,
            currentGuess: res.nextGuess!,
            currentQuestion: null,
            questionNumber: res.questionNumber,
          }));
        } else if (res.question) {
          setGame((prev) => ({
            ...prev,
            currentGuess: null,
            currentQuestion: res.question!,
            questionNumber: res.questionNumber,
          }));
        }
      }
    },
    [game.sessionId],
  );

  const handleRestart = useCallback(() => {
    setGame(INITIAL_GAME_STATE);
    setScreen('start');
  }, []);

  return (
    <div className={styles.app}>
      {screen === 'start' && <StartScreen onStart={handleStart} />}
      {screen === 'game' && (
        <GameScreen
          question={game.currentQuestion}
          guess={game.currentGuess}
          questionNumber={game.questionNumber}
          remainingCandidates={game.remainingCandidates}
          onAnswer={handleAnswer}
          onGuessResponse={handleGuessResponse}
        />
      )}
      {screen === 'result' && (
        <ResultScreen
          result={game.result ?? 'give_up'}
          work={game.guessedWork}
          totalQuestions={game.totalQuestions}
          onRestart={handleRestart}
        />
      )}
    </div>
  );
}
