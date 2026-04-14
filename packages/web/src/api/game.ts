import type {
  StartResponse,
  Answer,
  AnswerResponse,
  GuessResponse,
} from '../types/game';

const BASE = '/game';

async function request<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function startGame(): Promise<StartResponse> {
  return request<StartResponse>(`${BASE}/start`);
}

export function submitAnswer(
  sessionId: string,
  answer: Answer,
): Promise<AnswerResponse> {
  return request<AnswerResponse>(`${BASE}/${sessionId}/answer`, { answer });
}

export function submitGuessResponse(
  sessionId: string,
  correct: boolean,
): Promise<GuessResponse> {
  return request<GuessResponse>(`${BASE}/${sessionId}/guess-response`, {
    correct,
  });
}
