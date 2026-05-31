// サンプル譜面を userData/charts に自動インストールするユーティリティ
import type { Chart } from '../../types/chart';

export const SAMPLE_CHART: Chart = {
  version: 1,
  title: 'Sample Song',
  artist: 'ShareRhyth Demo',
  bpm: 128,
  audioFile: '',
  offset: 0,
  notes: []
};

// BPM 128 の 4/4 拍子でノーツを生成（60秒分）
function generateSampleNotes(): Chart['notes'] {
  const bpm = 128;
  const beat = 60 / bpm;
  const lanes = ['S', 'D', 'F', 'J', 'K', 'L'] as const;
  const notes: Chart['notes'] = [];
  let id = 0;

  // シンプルなパターン（16分音符ベース）
  const patterns = [
    [0, 0], [1, 1], [2, 2], [3, 3], // S D F J
    [4, 4], [5, 5], [6, 4], [7, 5], // K L K L
    [8, 2], [9, 3], [10, 1], [11, 4], // F J D K
    [12, 0], [13, 5], [14, 2], [15, 3] // S L F J
  ];

  for (let measure = 0; measure < 16; measure++) {
    for (const [subdivIdx, laneIdx] of patterns) {
      const time = 1.5 + measure * beat * 4 + subdivIdx * beat * 0.5;
      notes.push({
        id: String(id++),
        time: Math.round(time * 1000) / 1000,
        lane: lanes[laneIdx]
      });
    }
  }
  return notes;
}

SAMPLE_CHART.notes = generateSampleNotes();
