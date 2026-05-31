import { useReducer, useCallback } from 'react';
import type { JudgementResult } from '../../types/judgement';

interface GameplayState {
  score: number;
  combo: number;
  maxCombo: number;
  counts: Record<JudgementResult, number>;
  lastJudgement: JudgementResult | null;
}

type Action =
  | { type: 'HIT'; result: JudgementResult }
  | { type: 'MISS_AUTO' }
  | { type: 'RESET' };

const BASE_SCORE: Record<JudgementResult, number> = {
  PERFECT: 1000,
  GREAT: 700,
  GOOD: 400,
  MISS: 0
};

const initialState: GameplayState = {
  score: 0,
  combo: 0,
  maxCombo: 0,
  counts: { PERFECT: 0, GREAT: 0, GOOD: 0, MISS: 0 },
  lastJudgement: null
};

function reducer(state: GameplayState, action: Action): GameplayState {
  switch (action.type) {
    case 'HIT': {
      const { result } = action;
      const newCombo = result === 'MISS' ? 0 : state.combo + 1;
      const comboBonus = result === 'MISS' ? 1 : Math.floor(1 + newCombo * 0.1);
      const delta = BASE_SCORE[result] * comboBonus;
      return {
        score: state.score + delta,
        combo: newCombo,
        maxCombo: Math.max(state.maxCombo, newCombo),
        counts: { ...state.counts, [result]: state.counts[result] + 1 },
        lastJudgement: result
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

  const addJudgement = useCallback((result: JudgementResult) => {
    dispatch({ type: 'HIT', result });
  }, []);

  const addAutoMiss = useCallback(() => {
    dispatch({ type: 'MISS_AUTO' });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  return { ...state, addJudgement, addAutoMiss, reset };
}
