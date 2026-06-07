import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AudioEngine } from '../../engine/AudioEngine';
import { NoteRenderer } from '../../engine/NoteRenderer';
import { JudgementEngine } from '../../engine/JudgementEngine';
import { useGameplay } from './useGameplay';
import { ScoreDisplay } from './ScoreDisplay';
import { PauseOverlay } from './PauseOverlay';
import { loadSettings } from '../../lib/settings';
import type { Chart } from '../../types/chart';
import type { Lane } from '../../types/chart';
import { KEY_TO_LANE } from '../../constants/lanes';

const JUDGEMENT_EFFECT_COLORS: Record<string, number> = {
  PERFECT: 0xffe066,
  GREAT: 0x66d9ff,
  GOOD: 0x99ff99,
  MISS: 0xff6666
};

const NOTE_SPEED_DEFAULT = 400;

interface LocationState {
  chart: Chart;
  folderPath: string;
}

export const GameplayScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { chart, folderPath } = (location.state as LocationState) ?? {};

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef(new AudioEngine());
  const rendererRef = useRef<NoteRenderer | null>(null);
  const judgementRef = useRef(new JudgementEngine());
  const rafRef = useRef<number>(0);
  const notesLoadedRef = useRef(false);
  const gameStartedRef = useRef(false);
  const isPausedRef = useRef(false);
  const noteSpeedRef = useRef(NOTE_SPEED_DEFAULT);

  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [retryKey, setRetryKey] = useState(0);

  const gameplay = useGameplay();
  // useEffect クロージャから最新のスコアを参照するための ref
  const gameplayRef = useRef(gameplay);
  gameplayRef.current = gameplay;

  const startGame = useCallback(async () => {
    if (!chart || !folderPath) return;
    const audio = audioRef.current;
    const judgement = judgementRef.current;

    // ゲーム設定を適用
    const settings = loadSettings();
    noteSpeedRef.current = settings.noteSpeed;
    audio.volume = settings.volume / 100;

    if (chart.audioFile) {
      const absPath = await window.electronAPI.audio.getPath(folderPath, chart.audioFile);
      await audio.loadFromPath(absPath);
    } else {
      // 音楽ファイルなし → メトロノームビートで代替
      const duration = chart.notes.length > 0
        ? chart.notes[chart.notes.length - 1].time + 4
        : 60;
      audio.generateMetronomeBeat(duration, chart.bpm);
    }
    await audio.resume();

    judgement.loadChart(chart.notes);
    judgement.setJudgmentOffset(settings.judgmentOffset);
    notesLoadedRef.current = true;
    gameplay.init(chart.notes.length);

    // カウントダウン 3→2→1→start
    let count = 3;
    setCountdown(count);
    const tick = setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(tick);
        setCountdown(null);
        audio.play(0);
        gameStartedRef.current = true;
      } else {
        setCountdown(count);
      }
    }, 1000);
  }, [chart, folderPath, gameplay]);

  // ゲームループ
  useEffect(() => {
    if (!canvasRef.current) return;
    if (!chart) return;

    // リトライ時にリセット
    gameStartedRef.current = false;
    notesLoadedRef.current = false;

    const renderer = new NoteRenderer(canvasRef.current);
    rendererRef.current = renderer;

    const audio = audioRef.current;
    const judgement = judgementRef.current;

    // ノーツを事前に全部 renderer に追加（画面外から降ってくる）
    let notesAdded = false;

    const loop = () => {
      rafRef.current = requestAnimationFrame(loop);
      if (!gameStartedRef.current) return;
      if (isPausedRef.current) return;

      const ct = audio.currentTime;

      if (!notesAdded && notesLoadedRef.current && renderer.isReady) {
        renderer.setShowSyncLine(loadSettings().showSyncLine);
        renderer.loadNotes(chart.notes, 60 / chart.bpm);
        notesAdded = true;
      }

      renderer.updateNotes(ct, noteSpeedRef.current);

      const missed = judgement.processMiss(ct);
      for (const m of missed) {
        renderer.removeNote(m.id);
        gameplay.addAutoMiss();
        renderer.showHitEffect(m.lane as Lane, JUDGEMENT_EFFECT_COLORS['MISS']);
      }

      // 曲終了
      if (gameStartedRef.current && !audio.isPlaying && ct > 0.5) {
        gameStartedRef.current = false;
        const g = gameplayRef.current;
        navigate('/result', {
          state: {
            score: g.score,
            maxCombo: g.maxCombo,
            counts: g.counts,
            title: chart.title,
            artist: chart.artist,
            chart,
            folderPath
          }
        });
      }
    };

    rafRef.current = requestAnimationFrame(loop);
    // PixiJS init 完了を待ってからゲーム開始（destroy済みなら何もしない）
    renderer.readyPromise.then(() => {
      if (!renderer.isReady) return; // destroyed before init finished
      startGame();
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      renderer.destroy();
      audio.destroy();
      judgement.reset();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [retryKey]);

  // キー入力
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;

      if (e.key === 'Escape') {
        if (!gameStartedRef.current) return;
        const nowPaused = !isPausedRef.current;
        isPausedRef.current = nowPaused;
        setPaused(nowPaused);
        if (nowPaused) audioRef.current.pause();
        else audioRef.current.resume_playback();
        return;
      }

      if (!gameStartedRef.current || isPausedRef.current) return;

      const lane = KEY_TO_LANE[e.key.toLowerCase()];
      if (!lane) return;

      const ct = audioRef.current.currentTime;
      const result = judgementRef.current.processKeyDown(lane, ct);
      if (result) {
        rendererRef.current?.removeNote(result.noteId);
        rendererRef.current?.showHitEffect(lane, JUDGEMENT_EFFECT_COLORS[result.result]);
        gameplay.addJudgement(result.result);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!gameStartedRef.current || isPausedRef.current) return;
      const lane = KEY_TO_LANE[e.key.toLowerCase()];
      if (!lane) return;
      const ct = audioRef.current.currentTime;
      const result = judgementRef.current.processKeyUp(lane, ct);
      if (result) {
        rendererRef.current?.removeNote(result.noteId);
        rendererRef.current?.showHitEffect(lane, JUDGEMENT_EFFECT_COLORS[result.result]);
        gameplay.addJudgement(result.result);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleResume = useCallback(() => {
    isPausedRef.current = false;
    setPaused(false);
    audioRef.current.resume_playback();
  }, []);

  const handleRetry = useCallback(() => {
    gameStartedRef.current = false;
    notesLoadedRef.current = false;
    isPausedRef.current = false;
    setPaused(false);
    setRetryKey(k => k + 1);
  }, []);

  const handleQuit = useCallback(() => {
    navigate('/');
  }, [navigate]);

  if (!chart) {
    return (
      <div style={{ color: '#fff', padding: 40 }}>
        譜面データがありません。曲選択画面から選んでください。
        <button onClick={() => navigate('/')} style={{ marginLeft: 16, color: '#66d9ff' }}>
          戻る
        </button>
      </div>
    );
  }

  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* 曲情報 */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 24,
          color: '#aaaacc',
          pointerEvents: 'none'
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 700 }}>{chart.title}</div>
        <div style={{ fontSize: 12 }}>{chart.artist}</div>
      </div>

      <ScoreDisplay
        score={gameplay.score}
        combo={gameplay.combo}
        lastJudgement={gameplay.lastJudgement}
      />

      {/* カウントダウン */}
      {countdown !== null && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none'
          }}
        >
          <div
            style={{
              fontSize: 120,
              fontWeight: 900,
              color: '#ffffff',
              textShadow: '0 0 40px #6666ff',
              animation: 'pulse 0.8s ease-out'
            }}
          >
            {countdown}
          </div>
        </div>
      )}

      {paused && (
        <PauseOverlay onResume={handleResume} onRetry={handleRetry} onQuit={handleQuit} />
      )}

      <style>{`
        @keyframes fadeUp {
          from { opacity: 1; transform: translateX(-50%) translateY(0); }
          to   { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        }
        @keyframes pulse {
          from { transform: scale(1.4); opacity: 0; }
          to   { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};
