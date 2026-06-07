import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import type { JudgementResult } from '../../types/judgement';
import type { Chart } from '../../types/chart';

interface ResultState {
  score: number;
  maxCombo: number;
  counts: Record<JudgementResult, number>;
  title: string;
  artist: string;
  chart: Chart;
  folderPath: string;
}

function calcRank(score: number): string {
  if (score >= 975_000) return 'S';
  if (score >= 950_000) return 'AAA';
  if (score >= 925_000) return 'AA';
  if (score >= 900_000) return 'A';
  if (score >= 800_000) return 'BBB';
  if (score >= 700_000) return 'BB';
  if (score >= 600_000) return 'B';
  if (score >= 500_000) return 'C';
  return 'D';
}

export const ResultScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as ResultState | null;

  if (!state) {
    navigate('/');
    return null;
  }

  const { score, maxCombo, counts, title, artist, chart, folderPath } = state;
  const total = counts.PERFECT + counts.GREAT + counts.GOOD + counts.MISS;
  const rank = calcRank(score);
  const isFullCombo = counts.MISS === 0 && total > 0;
  const achievement = total > 0
    ? Math.round((counts.PERFECT * 1.01 + counts.GREAT * 1.00 + counts.GOOD * 0.50) * 100 / total * 10000) / 10000
    : 0;

  const RANK_COLORS: Record<string, string> = {
    S: '#ffe066',
    AAA: '#ffcc00', AA: '#ffd740', A: '#66d9ff',
    BBB: '#81c784', BB: '#99ff99', B: '#b2ff59',
    C: '#ffb74d', D: '#ff6666'
  };

  return (
    <div
      style={{
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#fff',
        fontFamily: 'Arial, sans-serif'
      }}
    >
      <div style={{ fontSize: 14, color: '#aaa', letterSpacing: 2, marginBottom: 4 }}>{artist}</div>
      <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 32 }}>{title}</div>

      {isFullCombo && (
        <div style={{ fontSize: 20, color: '#ffe066', letterSpacing: 4, marginBottom: 16, textShadow: '0 0 12px #ffe066' }}>
          FULL COMBO
        </div>
      )}

      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: RANK_COLORS[rank] ?? '#fff',
          textShadow: `0 0 30px ${RANK_COLORS[rank] ?? '#fff'}`,
          lineHeight: 1,
          marginBottom: 16
        }}
      >
        {rank}
      </div>

      <div style={{ fontSize: 36, fontWeight: 700, marginBottom: 32 }}>
        {score.toLocaleString()}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 48px', fontSize: 16, marginBottom: 8 }}>
        {(['PERFECT', 'GREAT', 'GOOD', 'MISS'] as JudgementResult[]).map((j) => (
          <div key={j} style={{ display: 'flex', justifyContent: 'space-between', gap: 24 }}>
            <span style={{ color: { PERFECT: '#ffe066', GREAT: '#66d9ff', GOOD: '#99ff99', MISS: '#ff6666' }[j] }}>
              {j}
            </span>
            <span style={{ fontWeight: 700 }}>{counts[j]}</span>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 14, color: '#aaa', marginBottom: 8 }}>
        MAX COMBO: <span style={{ color: '#fff', fontWeight: 700 }}>{maxCombo}</span>
      </div>

      <div style={{ fontSize: 14, color: '#aaa', marginBottom: 48 }}>
        達成率: <span style={{ color: '#fff', fontWeight: 700 }}>{achievement.toFixed(3)}%</span>
      </div>

      <div style={{ display: 'flex', gap: 20 }}>
        <button
          onClick={() => navigate('/')}
          style={{
            padding: '12px 32px',
            fontSize: 15,
            fontWeight: 700,
            color: '#aaaacc',
            background: 'transparent',
            border: '2px solid #aaaacc',
            borderRadius: 6,
            cursor: 'pointer'
          }}
        >
          タイトルに戻る
        </button>
        <button
          onClick={() => navigate('/play', { state: { chart, folderPath } })}
          style={{
            padding: '12px 40px',
            fontSize: 15,
            fontWeight: 700,
            color: '#0a0a0f',
            background: '#6666ff',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            boxShadow: '0 0 16px #6666ff88'
          }}
        >
          同じ曲を続けて遊ぶ
        </button>
      </div>
    </div>
  );
};
