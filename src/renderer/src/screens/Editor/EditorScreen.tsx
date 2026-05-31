import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AudioEngine } from '../../engine/AudioEngine';
import { useEditor } from './useEditor';
import { EditorTimeline } from './EditorTimeline';
import type { SelectionRange } from './EditorTimeline';
import { TapTempoButton } from './TapTempoButton';
import type { Chart, Note } from '../../types/chart';

interface LocationState {
  chart?: Chart;
  folderPath?: string;
}

const SNAP_OPTIONS = [
  { label: '1/4', value: 4 },
  { label: '1/8', value: 8 },
  { label: '1/12', value: 12 },
  { label: '1/16', value: 16 }
];

const inputStyle: React.CSSProperties = {
  background: '#111118',
  border: '1px solid #333355',
  color: '#fff',
  padding: '4px 8px',
  borderRadius: 4,
  fontSize: 13,
  width: '100%',
  boxSizing: 'border-box'
};

function fmtTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(2).padStart(5, '0');
  return `${m}:${s}`;
}

export const EditorScreen: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const loc = (location.state as LocationState) ?? {};

  const { chart, folderPath, isDirty, setFolderPath, addNote, removeNote, updateMeta, setLongNote, clearLongNote, pasteNotes, undo, redo, markSaved } =
    useEditor(loc.chart && loc.folderPath ? { chart: loc.chart, folderPath: loc.folderPath } : undefined);

  const audioRef = useRef<AudioEngine>(new AudioEngine());
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [displayTime, setDisplayTime] = useState(0);
  const [division, setDivision] = useState(4);
  const [isSaving, setIsSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [longNoteMode, setLongNoteMode] = useState(false);
  const [pendingLongNoteStartId, setPendingLongNoteStartId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectionRange, setSelectionRange] = useState<SelectionRange | null>(null);
  const [clipboard, setClipboard] = useState<Note[]>([]);
  const [pasteMode, setPasteMode] = useState(false);

  // refs for stable keyboard handler
  const chartRef = useRef(chart);
  chartRef.current = chart;
  const pendingLongNoteStartIdRef = useRef(pendingLongNoteStartId);
  pendingLongNoteStartIdRef.current = pendingLongNoteStartId;
  const isPlayingRef = useRef(false);
  const folderPathRef = useRef(folderPath);
  folderPathRef.current = folderPath;

  // Time display (low-freq poll)
  useEffect(() => {
    const id = setInterval(() => {
      setDisplayTime(audioRef.current.currentTime);
    }, 80);
    return () => clearInterval(id);
  }, []);

  // Auto-load audio when editing an existing chart
  useEffect(() => {
    const load = async () => {
      if (!loc.chart?.audioFile || !loc.folderPath) return;
      try {
        const abs = await window.electronAPI.audio.getPath(loc.folderPath, loc.chart.audioFile);
        await audioRef.current.loadFromPath(abs);
        await audioRef.current.resume();
        setAudioDuration(audioRef.current.duration);
      } catch {
        // audio load failure is non-fatal in editor
      }
    };
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showStatus = (text: string, ok: boolean) => {
    setStatusMsg({ text, ok });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  // ── Playback ──
  const handlePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (isPlayingRef.current) {
      audio.pause();
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      if (audio.duration === 0 && chartRef.current.bpm > 0) {
        // Metronome fallback when no audio file is loaded
        audio.generateMetronomeBeat(180, chartRef.current.bpm);
        setAudioDuration(audio.duration);
      }
      await audio.resume();
      audio.resume_playback();
      audio.onEnded = () => {
        isPlayingRef.current = false;
        setIsPlaying(false);
      };
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  }, []);

  const handleStop = useCallback(() => {
    audioRef.current.stop();
    isPlayingRef.current = false;
    setIsPlaying(false);
  }, []);

  // ── Audio file selection ──
  const handleSelectAudio = useCallback(async () => {
    const path = await window.electronAPI.dialog.openAudioFile();
    if (!path) return;
    try {
      await audioRef.current.loadFromPath(path);
      await audioRef.current.resume();
      setAudioDuration(audioRef.current.duration);
      const fileName = path.split(/[\\/]/).pop() ?? 'audio.mp3';
      updateMeta({ audioFile: fileName });
      // remember original path for copy-on-save
      (audioRef.current as AudioEngine & { _srcPath?: string })._srcPath = path;
    } catch (e) {
      console.error('[EditorScreen] audio load error:', e);
      showStatus('音楽ファイルの読み込みに失敗しました', false);
    }
  }, [updateMeta]);

  // ── Save ──
  const handleSave = useCallback(async () => {
    setIsSaving(true);
    try {
      let target = folderPathRef.current;
      if (!target) {
        const dir = await window.electronAPI.charts.getDir();
        const id = chartRef.current.title.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now();
        target = dir + '/' + id;
        setFolderPath(target);
        folderPathRef.current = target;
      }
      // Copy audio if a new file was selected
      const audio = audioRef.current as AudioEngine & { _srcPath?: string };
      if (audio._srcPath && chartRef.current.audioFile) {
        await window.electronAPI.chart.copyAudio(audio._srcPath, target);
        delete audio._srcPath;
      }
      await window.electronAPI.chart.save(target, chartRef.current);
      markSaved();
      showStatus('保存しました', true);
    } catch (e) {
      showStatus('保存に失敗しました', false);
      console.error(e);
    }
    setIsSaving(false);
  }, [setFolderPath, markSaved]);

  // ── Share ──
  const handleShare = useCallback(async () => {
    if (!folderPathRef.current) {
      showStatus('先に保存してください', false);
      return;
    }
    const prevShareId = chartRef.current.shareId;
    showStatus('アップロード中...', true);
    try {
      const { uploadChart } = await import('../../lib/chartShare');
      const id = await uploadChart(chartRef.current, folderPathRef.current);
      if (id !== prevShareId) {
        // 新規 INSERT（初回 or DB 側で削除されてフォールバックした場合）
        const saved = { ...chartRef.current, shareId: id };
        updateMeta({ shareId: id });
        await window.electronAPI.chart.save(folderPathRef.current, saved);
        markSaved();
      }
      const isUpdate = !!prevShareId && id === prevShareId;
      showStatus(isUpdate ? '共有を更新しました' : `共有完了！ ID: ${id.slice(0, 8)}`, true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';
      showStatus(`共有失敗: ${msg}`, false);
    }
  }, [updateMeta, markSaved]);

  // 選択範囲内のノーツ ID（derived）
  const selectedNoteIds = useMemo(() => {
    if (!selectionRange) return new Set<string>();
    return new Set(
      chart.notes
        .filter(n => n.time >= selectionRange.startTime && n.time <= selectionRange.endTime)
        .map(n => n.id)
    );
  }, [chart.notes, selectionRange]);

  // ── Selection mode ──
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(m => {
      if (m) setSelectionRange(null); // 終了時に選択解除
      return !m;
    });
    setPasteMode(false);
  }, []);

  // ── Copy ──
  const handleCopy = useCallback(() => {
    if (!selectionRange) { showStatus('範囲を選択してください', false); return; }
    const notes = chart.notes.filter(
      n => n.time >= selectionRange.startTime && n.time <= selectionRange.endTime
    );
    if (notes.length === 0) { showStatus('選択範囲にノーツがありません', false); return; }
    const minTime = Math.min(...notes.map(n => n.time));
    setClipboard(notes.map(n => ({ ...n, time: n.time - minTime })));
    showStatus(`${notes.length}個コピーしました`, true);
  }, [chart.notes, selectionRange]);

  const handleCopyRef = useRef(handleCopy);
  handleCopyRef.current = handleCopy;

  // ── Paste ──
  const handlePaste = useCallback((pasteTime: number) => {
    if (clipboard.length === 0) return;
    pasteNotes(pasteTime, clipboard);
    setPasteMode(false);
    showStatus(`${clipboard.length}個を貼り付けました`, true);
  }, [clipboard, pasteNotes]);

  // Ctrl+V: 再生ヘッド位置に即ペースト
  const handlePasteAtPlayhead = useCallback(() => {
    if (clipboard.length === 0) { showStatus('クリップボードが空です', false); return; }
    const pasteTime = audioRef.current.currentTime;
    pasteNotes(pasteTime, clipboard);
    showStatus(`${clipboard.length}個を貼り付けました（${pasteTime.toFixed(2)}s）`, true);
  }, [clipboard, pasteNotes]);

  const handlePasteAtPlayheadRef = useRef(handlePasteAtPlayhead);
  handlePasteAtPlayheadRef.current = handlePasteAtPlayhead;

  // ペーストモードへ切替（クリックで位置指定）
  const enterPasteMode = useCallback(() => {
    if (clipboard.length === 0) { showStatus('クリップボードが空です', false); return; }
    setPasteMode(p => !p);
  }, [clipboard]);

  // ── Long note mode ──
  const toggleLongNoteMode = useCallback(() => {
    setLongNoteMode(m => !m);
    setPendingLongNoteStartId(null);
  }, []);

  const handleLongNoteClick = useCallback((noteId: string | null) => {
    const pending = pendingLongNoteStartIdRef.current;
    if (noteId === null) {
      setPendingLongNoteStartId(null);
      return;
    }
    if (pending === null) {
      setPendingLongNoteStartId(noteId);
      return;
    }
    if (pending === noteId) {
      setPendingLongNoteStartId(null);
      return;
    }
    const c = chartRef.current;
    const startNote = c.notes.find(n => n.id === pending);
    const clickedNote = c.notes.find(n => n.id === noteId);
    if (startNote && clickedNote) {
      if (startNote.longNoteEndId === noteId) {
        clearLongNote(pending);
      } else if (clickedNote.longNoteEndId === pending) {
        clearLongNote(noteId);
      } else {
        setLongNote(pending, noteId);
      }
    }
    setPendingLongNoteStartId(null);
  }, [setLongNote, clearLongNote]);

  // ── Open folder ──
  const handleOpenFolder = useCallback(async () => {
    if (folderPathRef.current) {
      await window.electronAPI.chart.openFolder(folderPathRef.current);
    }
  }, []);

  // ── Keyboard shortcuts ──
  const handleSaveRef = useRef(handleSave);
  handleSaveRef.current = handleSave;
  const handlePlayPauseRef = useRef(handlePlayPause);
  handlePlayPauseRef.current = handlePlayPause;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === ' ') {
        e.preventDefault();
        handlePlayPauseRef.current();
      } else if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
        e.preventDefault();
        undo();
      } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) {
        e.preventDefault();
        redo();
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSaveRef.current();
      } else if (e.ctrlKey && e.key === 'c') {
        e.preventDefault();
        handleCopyRef.current();
      } else if (e.ctrlKey && e.key === 'v') {
        e.preventDefault();
        handlePasteAtPlayheadRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [undo, redo]);

  // ── Render ──
  const btnPrimary: React.CSSProperties = {
    padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4,
    cursor: 'pointer', border: 'none', background: '#6666ff', color: '#fff'
  };
  const btnSecondary: React.CSSProperties = {
    padding: '6px 14px', fontSize: 12, fontWeight: 700, borderRadius: 4,
    cursor: 'pointer', border: '1px solid #555', background: 'transparent', color: '#aaa'
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', background: '#0a0a0f', color: '#fff', fontFamily: 'Arial, sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ height: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', borderBottom: '1px solid #333355', flexShrink: 0 }}>
        <button
          onClick={() => { if (isDirty && !confirm('変更を破棄しますか？')) return; navigate('/'); }}
          style={btnSecondary}
        >
          ← 戻る
        </button>
        <span style={{ color: '#6666ff', fontWeight: 900, fontSize: 15, letterSpacing: 3 }}>EDITOR</span>
        <div style={{ flex: 1 }} />
        {isDirty && <span style={{ color: '#ffb74d', fontSize: 12 }}>● 未保存</span>}
        {statusMsg && (
          <span style={{ fontSize: 12, color: statusMsg.ok ? '#99ff99' : '#ff6666' }}>
            {statusMsg.text}
          </span>
        )}
        <button onClick={handleSave} disabled={isSaving} style={btnPrimary}>
          {isSaving ? '保存中...' : 'Ctrl+S 保存'}
        </button>
        {folderPath && (
          <button onClick={handleOpenFolder} style={btnSecondary}>フォルダを開く</button>
        )}
        <button onClick={handleShare} style={btnSecondary}>オンラインで共有</button>
      </div>

      {/* ── Body ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left panel */}
        <div style={{ width: 210, borderRight: '1px solid #333355', padding: 14, display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0, overflowY: 'auto' }}>
          <div style={{ color: '#888', fontSize: 11, letterSpacing: 2 }}>曲情報</div>

          {([ ['タイトル', 'title'], ['アーティスト', 'artist'] ] as const).map(([label, key]) => (
            <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ color: '#888', fontSize: 10 }}>{label}</span>
              <input
                type="text"
                value={chart[key]}
                onChange={e => updateMeta({ [key]: e.target.value })}
                style={inputStyle}
              />
            </label>
          ))}

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ color: '#888', fontSize: 10 }}>BPM</span>
            <input
              type="number"
              min={1}
              max={500}
              value={chart.bpm}
              onChange={e => updateMeta({ bpm: Math.max(1, Number(e.target.value)) })}
              style={inputStyle}
            />
          </label>

          <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ color: '#888', fontSize: 10 }}>オフセット (秒)</span>
            <input
              type="number"
              step={0.001}
              value={chart.offset}
              onChange={e => updateMeta({ offset: Number(e.target.value) })}
              style={inputStyle}
            />
          </label>

          <div style={{ color: '#888', fontSize: 10, marginTop: 6 }}>音楽ファイル</div>
          <button onClick={handleSelectAudio} style={{ ...btnSecondary, width: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {chart.audioFile || '選択...'}
          </button>
          {audioDuration > 0 && (
            <div style={{ color: '#555', fontSize: 10 }}>{fmtTime(audioDuration)}</div>
          )}

          <div style={{ marginTop: 8, color: '#888', fontSize: 10 }}>ノーツ数</div>
          <div style={{ color: '#ffe066', fontWeight: 700, fontSize: 18 }}>{chart.notes.length}</div>
        </div>

        {/* Center: timeline */}
        <EditorTimeline
          chart={chart}
          audioRef={audioRef}
          isPlaying={isPlaying}
          audioDuration={audioDuration}
          division={division}
          onAddNote={addNote}
          onRemoveNote={removeNote}
          longNoteMode={longNoteMode}
          pendingLongNoteStartId={pendingLongNoteStartId}
          onLongNoteClick={handleLongNoteClick}
          selectionMode={selectionMode}
          selectionRange={selectionRange}
          selectedNoteIds={selectedNoteIds}
          onSelectionChange={setSelectionRange}
          pasteMode={pasteMode}
          clipboard={clipboard}
          onPaste={handlePaste}
        />

        {/* Right panel */}
        <div style={{ width: 170, borderLeft: '1px solid #333355', padding: 14, display: 'flex', flexDirection: 'column', gap: 14, flexShrink: 0 }}>
          <div>
            <div style={{ color: '#888', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>スナップ</div>
            {SNAP_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDivision(opt.value)}
                style={{
                  ...( division === opt.value ? btnPrimary : btnSecondary ),
                  display: 'block', width: '100%', marginBottom: 4, padding: '5px 0'
                }}
              >
                {opt.label} 拍
              </button>
            ))}
          </div>

          <div>
            <div style={{ color: '#888', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>タップテンポ</div>
            <TapTempoButton onBpm={bpm => updateMeta({ bpm })} />
          </div>

          <div>
            <div style={{ color: '#888', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>選択・コピペ</div>
            <button
              onClick={toggleSelectionMode}
              style={{
                ...(selectionMode ? btnPrimary : btnSecondary),
                display: 'block', width: '100%', marginBottom: 4, padding: '5px 0', fontSize: 11
              }}
            >
              {selectionMode ? '選択中 (解除)' : '範囲選択'}
            </button>
            <button
              onClick={handleCopy}
              disabled={!selectionRange || selectedNoteIds.size === 0}
              style={{
                ...btnSecondary,
                display: 'block', width: '100%', marginBottom: 4, padding: '5px 0', fontSize: 11,
                opacity: (!selectionRange || selectedNoteIds.size === 0) ? 0.4 : 1
              }}
            >
              コピー (Ctrl+C){selectedNoteIds.size > 0 ? ` [${selectedNoteIds.size}]` : ''}
            </button>
            <button
              onClick={enterPasteMode}
              disabled={clipboard.length === 0}
              style={{
                ...(pasteMode ? btnPrimary : btnSecondary),
                display: 'block', width: '100%', marginBottom: 4, padding: '5px 0', fontSize: 11,
                opacity: clipboard.length === 0 ? 0.4 : 1
              }}
            >
              {pasteMode ? 'クリックで貼付...' : `貼り付け[${clipboard.length}]`}
            </button>
            {clipboard.length > 0 && !pasteMode && (
              <div style={{ color: '#666', fontSize: 10, marginBottom: 4 }}>
                Ctrl+V: 再生ヘッド位置へ
              </div>
            )}
          </div>

          <div>
            <div style={{ color: '#888', fontSize: 11, letterSpacing: 2, marginBottom: 8 }}>ロングノーツ</div>
            <button
              onClick={toggleLongNoteMode}
              style={{
                ...( longNoteMode ? btnPrimary : btnSecondary ),
                display: 'block', width: '100%', padding: '6px 0', fontSize: 11
              }}
            >
              {longNoteMode
                ? pendingLongNoteStartId ? '終点を選択...' : '始点を選択...'
                : 'ロングノーツ作成'}
            </button>
            {longNoteMode && (
              <div style={{ color: '#aaa', fontSize: 10, marginTop: 4, lineHeight: 1.5 }}>
                ノーツを2つ順にクリック<br />
                既存の連結は解除される<br />
                もう一度押すと終了
              </div>
            )}
          </div>

          <div style={{ flex: 1 }} />

          <div style={{ color: '#555', fontSize: 10, lineHeight: 1.7 }}>
            左クリック: 配置/削除<br />
            右クリック: 削除<br />
            Space: 再生/停止<br />
            Ctrl+Z: 元に戻す<br />
            Ctrl+Y: やり直し<br />
            Ctrl+S: 保存<br />
            ホイール: スクロール
          </div>
        </div>
      </div>

      {/* ── Playback bar ── */}
      <div style={{ height: 50, borderTop: '1px solid #333355', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', flexShrink: 0 }}>
        <button onClick={handleStop} style={{ ...btnSecondary, fontSize: 16, padding: '4px 10px' }}>■</button>
        <button onClick={() => handlePlayPauseRef.current()} style={{ ...btnPrimary, minWidth: 88 }}>
          {isPlaying ? '⏸ 停止' : '▶ 再生'}
        </button>
        <span style={{ color: '#aaa', fontFamily: 'monospace', fontSize: 14 }}>
          {fmtTime(displayTime)}{audioDuration > 0 && ` / ${fmtTime(audioDuration)}`}
        </span>
      </div>
    </div>
  );
};
