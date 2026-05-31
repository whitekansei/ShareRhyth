import React, { useEffect, useState } from 'react';
import type { JudgementResult } from '../../types/judgement';

interface Props {
  score: number;
  combo: number;
  lastJudgement: JudgementResult | null;
}

const JUDGEMENT_COLORS: Record<JudgementResult, string> = {
  PERFECT: '#ffe066',
  GREAT: '#66d9ff',
  GOOD: '#99ff99',
  MISS: '#ff6666'
};

export const ScoreDisplay: React.FC<Props> = ({ score, combo, lastJudgement }) => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!lastJudgement) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(t);
  }, [lastJudgement, score]);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center'
      }}
    >
      {/* score */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 24,
          fontSize: 28,
          fontWeight: 'bold',
          color: '#ffffff',
          fontFamily: 'monospace',
          textShadow: '0 0 8px #6666ff'
        }}
      >
        {score.toLocaleString()}
      </div>

      {/* combo */}
      {combo >= 2 && (
        <div
          style={{
            position: 'absolute',
            top: '12%',
            left: '50%',
            transform: 'translateX(-50%)',
            textAlign: 'center'
          }}
        >
          <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1 }}>
            {combo}
          </div>
          <div style={{ fontSize: 14, color: '#aaa', letterSpacing: 3 }}>COMBO</div>
        </div>
      )}

      {/* judgement text */}
      {visible && lastJudgement && (
        <div
          style={{
            position: 'absolute',
            top: '62%',
            left: '50%',
            transform: 'translateX(-50%)',
            fontSize: 32,
            fontWeight: 'bold',
            color: JUDGEMENT_COLORS[lastJudgement],
            textShadow: `0 0 16px ${JUDGEMENT_COLORS[lastJudgement]}`,
            letterSpacing: 4,
            animation: 'fadeUp 0.4s ease-out forwards'
          }}
        >
          {lastJudgement}
        </div>
      )}
    </div>
  );
};
