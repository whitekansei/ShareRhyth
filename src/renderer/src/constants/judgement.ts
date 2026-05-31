import type { JudgementResult } from '../types/judgement';

export const JUDGEMENT_WINDOWS: Record<Exclude<JudgementResult, 'MISS'>, number> = {
  PERFECT: 40,
  GREAT: 80,
  GOOD: 120
};

export const MISS_THRESHOLD = 200;
