export type Lane = 'S' | 'D' | 'F' | 'J' | 'K' | 'L';

export interface Note {
  id: string;
  time: number;
  lane: Lane;
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
}

export interface ChartMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  difficulty?: number;
  folderPath: string;
}
