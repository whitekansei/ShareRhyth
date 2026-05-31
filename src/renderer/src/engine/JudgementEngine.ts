import type { Note, Lane } from '../types/chart';
import type { HitResult, JudgementResult } from '../types/judgement';
import { JUDGEMENT_WINDOWS, MISS_THRESHOLD } from '../constants/judgement';

export class JudgementEngine {
  private queues: Map<Lane, Note[]> = new Map();
  private keyUpQueues: Map<Lane, Note[]> = new Map();
  private longNoteEndIds: Set<string> = new Set();
  private judgmentOffsetMs = 0; // 正=遅め補正、負=早め補正

  loadChart(notes: Note[]): void {
    this.queues.clear();
    this.keyUpQueues.clear();
    this.longNoteEndIds.clear();

    for (const note of notes) {
      if (note.longNoteEndId) this.longNoteEndIds.add(note.longNoteEndId);
    }

    const sorted = [...notes].sort((a, b) => a.time - b.time);
    for (const note of sorted) {
      const isEnd = this.longNoteEndIds.has(note.id);
      const targetMap = isEnd ? this.keyUpQueues : this.queues;
      const q = targetMap.get(note.lane) ?? [];
      q.push(note);
      targetMap.set(note.lane, q);
    }
  }

  setJudgmentOffset(ms: number): void {
    this.judgmentOffsetMs = ms;
  }

  private judgeNote(note: Note, lane: Lane, currentTime: number): HitResult | null {
    const delta = (currentTime - note.time) * 1000 - this.judgmentOffsetMs;
    const abs = Math.abs(delta);
    let result: JudgementResult;
    if (abs <= JUDGEMENT_WINDOWS.PERFECT) result = 'PERFECT';
    else if (abs <= JUDGEMENT_WINDOWS.GREAT) result = 'GREAT';
    else if (abs <= JUDGEMENT_WINDOWS.GOOD) result = 'GOOD';
    else if (abs <= MISS_THRESHOLD) result = 'MISS';
    else return null;
    return { noteId: note.id, lane, result, delta };
  }

  processKeyDown(lane: Lane, currentTime: number): HitResult | null {
    const q = this.queues.get(lane);
    if (!q || q.length === 0) return null;
    const note = q[0];
    const hit = this.judgeNote(note, lane, currentTime);
    if (hit) q.shift();
    return hit;
  }

  processKeyUp(lane: Lane, currentTime: number): HitResult | null {
    const q = this.keyUpQueues.get(lane);
    if (!q || q.length === 0) return null;
    const note = q[0];
    const hit = this.judgeNote(note, lane, currentTime);
    if (hit) q.shift();
    return hit;
  }

  processMiss(currentTime: number): Note[] {
    const missed: Note[] = [];
    for (const [, q] of this.queues) {
      while (q.length > 0 && (currentTime - q[0].time) * 1000 > MISS_THRESHOLD) {
        missed.push(q.shift()!);
      }
    }
    for (const [, q] of this.keyUpQueues) {
      while (q.length > 0 && (currentTime - q[0].time) * 1000 > MISS_THRESHOLD) {
        missed.push(q.shift()!);
      }
    }
    return missed;
  }

  reset(): void {
    this.queues.clear();
    this.keyUpQueues.clear();
    this.longNoteEndIds.clear();
    this.judgmentOffsetMs = 0;
  }

  remainingNotes(): number {
    let count = 0;
    for (const [, q] of this.queues) count += q.length;
    for (const [, q] of this.keyUpQueues) count += q.length;
    return count;
  }
}
