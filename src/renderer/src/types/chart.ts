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
  notes: Note[];
  shareId?: string; // Supabase の行 ID（初回共有後にローカルへ保存される）
}

export interface ChartMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  folderPath: string;
}
