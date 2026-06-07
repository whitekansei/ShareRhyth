export type Lane = 'S' | 'D' | 'F' | 'J' | 'K' | 'L';

export interface Note {
  id: string;
  time: number;
  lane: Lane;
  longNoteEndId?: string; // 設定されている場合、このノーツはロングノーツの始点
}

export interface Chart {
  version: 1;
  title: string;
  artist: string;
  bpm: number;
  audioFile: string;
  offset: number;
  difficulty?: number;
  notes: Note[];
  shareId?: string;
}

export interface ChartMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty?: number;
  folderPath: string;
}
