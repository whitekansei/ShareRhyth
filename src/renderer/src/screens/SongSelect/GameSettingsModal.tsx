import React, { useState, useCallback } from 'react';
import { loadSettings, saveSettings, SETTINGS_DEFAULTS } from '../../lib/settings';
import type { GameSettings } from '../../lib/settings';

interface Props {
  onClose: () => void;
}

const sliderStyle: React.CSSProperties = {
  width: '100%',
  accentColor: '#6666ff',
  cursor: 'pointer'
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 6
};

const hintStyle: React.CSSProperties = {
  fontSize: 10,
  color: '#555',
  marginTop: 4,
  lineHeight: 1.5
};

const sectionStyle: React.CSSProperties = {
  marginBottom: 28
};

export const GameSettingsModal: React.FC<Props> = ({ onClose }) => {
  const [s, setS] = useState<GameSettings>(() => loadSettings());

  const update = useCallback(<K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    setS(prev => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  const handleReset = useCallback(() => {
    setS({ ...SETTINGS_DEFAULTS });
    saveSettings({ ...SETTINGS_DEFAULTS });
  }, []);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#111118',
          border: '1px solid #333355',
          borderRadius: 10,
          padding: '32px 40px',
          width: 460,
          maxWidth: '90vw',
          color: '#fff',
          fontFamily: 'Arial, sans-serif'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* タイトル */}
        <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 4, color: '#6666ff', marginBottom: 28 }}>
          GAME SETTINGS
        </div>

        {/* ── ノーツ速度 ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>ノーツ速度</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#6666ff', minWidth: 50, textAlign: 'right' }}>
              {s.noteSpeed}
            </span>
          </div>
          <input
            type="range" min={100} max={900} step={50}
            value={s.noteSpeed}
            onChange={e => update('noteSpeed', Number(e.target.value))}
            style={sliderStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', ...hintStyle }}>
            <span>遅い</span>
            <span>速い</span>
          </div>
          <div style={hintStyle}>
            ノーツの落下速度を変更します（判定タイミングには影響しません）
          </div>
        </div>

        {/* ── 音量 ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>音量</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: '#6666ff', minWidth: 50, textAlign: 'right' }}>
              {s.volume}%
            </span>
          </div>
          <input
            type="range" min={0} max={100} step={5}
            value={s.volume}
            onChange={e => update('volume', Number(e.target.value))}
            style={sliderStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', ...hintStyle }}>
            <span>0%</span>
            <span>100%</span>
          </div>
        </div>

        {/* ── 判定オフセット ── */}
        <div style={sectionStyle}>
          <div style={labelStyle}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>判定オフセット</span>
            <span style={{ fontSize: 18, fontWeight: 900, color: s.judgmentOffset === 0 ? '#6666ff' : '#ffb74d', minWidth: 70, textAlign: 'right' }}>
              {s.judgmentOffset > 0 ? '+' : ''}{s.judgmentOffset} ms
            </span>
          </div>
          <input
            type="range" min={-200} max={200} step={5}
            value={s.judgmentOffset}
            onChange={e => update('judgmentOffset', Number(e.target.value))}
            style={sliderStyle}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', ...hintStyle }}>
            <span>−200ms（早め）</span>
            <span>+200ms（遅め）</span>
          </div>
          <div style={hintStyle}>
            常に「遅い」と判定される場合は＋方向に、「早い」場合は−方向に調整してください。<br />
            環境のオーディオ遅延を補正します。
          </div>
        </div>

        {/* ── 同時押しライン ── */}
        <div style={sectionStyle}>
          <div
            style={{ ...labelStyle, cursor: 'pointer', userSelect: 'none' }}
            onClick={() => update('showSyncLine', !s.showSyncLine)}
          >
            <span style={{ fontSize: 13, fontWeight: 700 }}>同時押しライン</span>
            <div style={{
              width: 44, height: 24, borderRadius: 12, flexShrink: 0,
              background: s.showSyncLine ? '#6666ff' : '#333',
              position: 'relative', transition: 'background 0.2s'
            }}>
              <div style={{
                position: 'absolute', top: 3,
                left: s.showSyncLine ? 23 : 3,
                width: 18, height: 18, borderRadius: '50%',
                background: '#fff', transition: 'left 0.2s'
              }} />
            </div>
          </div>
          <div style={hintStyle}>
            同時に押すノーツを白い横線で繋いで表示します。
          </div>
        </div>

        {/* ボタン */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <button
            onClick={handleReset}
            style={{
              padding: '8px 20px', fontSize: 12, fontWeight: 700,
              background: 'transparent', border: '1px solid #555',
              color: '#888', borderRadius: 4, cursor: 'pointer'
            }}
          >
            リセット
          </button>
          <button
            onClick={onClose}
            style={{
              padding: '8px 32px', fontSize: 13, fontWeight: 700,
              background: '#6666ff', border: 'none',
              color: '#fff', borderRadius: 4, cursor: 'pointer'
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
