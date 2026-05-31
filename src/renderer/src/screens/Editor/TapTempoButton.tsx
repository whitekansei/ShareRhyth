import React, { useRef, useCallback, useState } from 'react';

interface Props {
  onBpm: (bpm: number) => void;
}

export const TapTempoButton: React.FC<Props> = ({ onBpm }) => {
  const tapsRef = useRef<number[]>([]);
  const [displayBpm, setDisplayBpm] = useState<number | null>(null);

  const handleTap = useCallback(() => {
    const now = performance.now();
    tapsRef.current.push(now);
    if (tapsRef.current.length > 9) tapsRef.current.shift();
    if (tapsRef.current.length < 2) {
      setDisplayBpm(null);
      return;
    }
    const intervals: number[] = [];
    for (let i = 1; i < tapsRef.current.length; i++) {
      intervals.push(tapsRef.current[i] - tapsRef.current[i - 1]);
    }
    const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const bpm = Math.min(300, Math.max(30, Math.round(60000 / avgMs)));
    setDisplayBpm(bpm);
    onBpm(bpm);
  }, [onBpm]);

  const handleReset = useCallback(() => {
    tapsRef.current = [];
    setDisplayBpm(null);
  }, []);

  return (
    <div>
      <button
        onClick={handleTap}
        style={{
          width: '100%',
          padding: '10px 0',
          fontSize: 14,
          fontWeight: 700,
          color: '#fff',
          background: '#1a1a3f',
          border: '2px solid #6666ff',
          borderRadius: 6,
          cursor: 'pointer',
          letterSpacing: 2
        }}
      >
        TAP {displayBpm !== null ? displayBpm : ''}
      </button>
      {displayBpm !== null && (
        <button
          onClick={handleReset}
          style={{
            width: '100%',
            marginTop: 4,
            fontSize: 11,
            color: '#666',
            background: 'transparent',
            border: 'none',
            cursor: 'pointer'
          }}
        >
          リセット
        </button>
      )}
    </div>
  );
};
