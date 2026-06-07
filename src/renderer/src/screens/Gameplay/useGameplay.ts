import { useReducer, useCallback } from 'react';
import type { JudgementResult } from '../../types/judgement';

interface GameplayState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<JudgementResult, number>;
  lastJudgement: JudgementResult | null;
  totalNotes: number;
}

type Action =
  | { type: 'INIT'; totalNotes: number }
  | { type: 'HIT'; result: JudgementResult }
  | { type: 'MISS_AUTO' }
  | { type: 'RESET' };

function calcScore(counts: Record<JudgementResult, number>, totalNotes: number): number {
  if (totalNotes === 0) return 0;
  const baseUnit = 1_000_000 / totalNotes;
  return Math.floor(
    baseUnit * counts.PERFECT +
    baseUnit * 0.9 * counts.GREAT +
    baseUnit * 0.5 * counts.GOOD
  );
}

const initialState: GameplayState = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
  lastJudgement: null,
  totalNotes: 0
};

function reducer(state: GameplayState, action: Action): GameplayState {
  switch (action.type) {
    case 'INIT':
      return { ...initialState, totalNotes: action.totalNotes };
    case 'HIT': {
      const { result } = action;
      const newCombo = result === 'MISS' ? 0 : state.combo + 1;
      const newCounts = { ...state.counts, [result]: state.counts[result] + 1 };
      return {
        score: calcScore(newCounts, state.totalNotes),
        combo: newCombo,
        maxCombo: Math.max(state.maxCombo, newCombo),
        counts: newCounts,
        lastJudgement: result,
        totalNotes: state.totalNotes
      };
    }
    case 'MISS_AUTO': {
      return {
        ...state,
        combo: 0,
        counts: { ...state.counts, MISS: state.counts.MISS + 1 },
        lastJudgement: 'MISS'
      };
    }
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export function useGameplay() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const init = useCallback((totalNotes: number) => {
    dispatch({ type: 'INIT', totalNotes });
  }, []);

  const addJudgement = useCallback((result: JudgementResult) => {
    dispatch({ type: 'HIT', result });
  }, []);

  const addAutoMiss = useCallback(() => {
    dispatch({ type: 'MISS_AUTO' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return { ...state, init, addJudgement, addAutoMiss, reset };
}
