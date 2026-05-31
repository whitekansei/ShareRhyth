export interface GameSettings {
  noteSpeed: number;        // px/s  100–900
  volume: number;           // 0–100 (%)
  judgmentOffset: number;   // ms  -200–+200（正=遅め補正）
}

export const SETTINGS_DEFAULTS: GameSettings = {
  noteSpeed: 400,
  volume: 100,
  judgmentOffset: 0
};

const KEY = 'sharerhyth_settings';

export function loadSettings(): GameSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...SETTINGS_DEFAULTS };
    return { ...SETTINGS_DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return { ...SETTINGS_DEFAULTS };
  }
}

export function saveSettings(s: GameSettings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
