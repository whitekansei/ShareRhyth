import React from 'react';

interface Props {
  onResume: () => void;
  onRetry: () => void;
  onQuit: () => void;
}

export const PauseOverlay: React.FC<Props> = ({ onResume, onRetry, onQuit }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: 'rgba(0,0,0,0.75)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      zIndex: 100
    }}
  >
    <div style={{ fontSize: 48, fontWeight: 900, color: '#fff', letterSpacing: 6, marginBottom: 20 }}>
      PAUSED
    </div>
    {[
      { label: 'RESUME', onClick: onResume, color: '#66d9ff' },
      { label: 'RETRY', onClick: onRetry, color: '#ffe066' },
      { label: 'QUIT', onClick: onQuit, color: '#ff6666' }
    ].map(({ label, onClick, color }) => (
      <button
        key={label}
        onClick={onClick}
        style={{
          width: 220,
          padding: '12px 0',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: 4,
          color,
          background: 'transparent',
          border: `2px solid ${color}`,
          borderRadius: 6,
          cursor: 'pointer',
          transition: 'background 0.15s'
        }}
        onMouseEnter={(e) => ((e.target as HTMLButtonElement).style.background = `${color}22`)}
        onMouseLeave={(e) => ((e.target as HTMLButtonElement).style.background = 'transparent')}
      >
        {label}
      </button>
    ))}
  </div>
);
