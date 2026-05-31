import type { Lane } from '../types/chart';

export const LANE_KEYS: Record<Lane, number> = {
  S: 0,
  D: 1,
  F: 2,
  J: 3,
  K: 4,
  L: 5
};

export const KEY_TO_LANE: Record<string, Lane> = {
  s: 'S',
  d: 'D',
  f: 'F',
  j: 'J',
  k: 'K',
  l: 'L'
};

export const LANE_COUNT = 6;
export const LANES: Lane[] = ['S', 'D', 'F', 'J', 'K', 'L'];
