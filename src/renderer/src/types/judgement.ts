export type JudgementResult = 'PERFECT' | 'GREAT' | 'GOOD' | 'MISS';

export interface HitResult {
  noteId: string;
  lane: string;
  result: JudgementResult;
  delta: number;
}
