import React, { useRef, useEffect, useCallback } from 'react';
import type { Chart, Lane, Note } from '../../types/chart';
import type { AudioEngine } from '../../engine/AudioEngine';
import { LANE_KEYS, LANES, LANE_COUNT } from '../../constants/lanes';

const PPS = 200;
const NOTE_H = 16;

const LANE_COLORS: Record<Lane, string> = {
  S: '#4fc3f7',
  D: '#81c784',
  F: '#ffb74d',
  J: '#ffb74d',
  K: '#81c784',
  L: '#4fc3f7'
};

export interface SelectionRange {
  startTime: number;
  endTime: number;
}

interface Props {
  chart: Chart;
  audioRef: React.RefObject<AudioEngine>;
  isPlaying: boolean;
  audioDuration: number;
  division: number;
  onAddNote: (time: number, lane: Lane) => void;
  onRemoveNote: (id: string) => void;
  // ロングノーツ
  longNoteMode: boolean;
  pendingLongNoteStartId: string | null;
  onLongNoteClick: (noteId: string | null) => void;
  // 選択・コピー・ペースト
  selectionMode: boolean;
  selectionRange: SelectionRange | null;
  selectedNoteIds: ReadonlySet<string>;
  onSelectionChange: (range: SelectionRange | null) => void;
  pasteMode: boolean;
  clipboard: Note[];
  onPaste: (pasteTime: number) => void;
}

function getLaneGeom(width: number) {
  const total = Math.min(width * 0.72, LANE_COUNT * 90);
  const laneW = total / LANE_COUNT;
  const offsetX = (width - total) / 2;
  return { laneW, offsetX, total };
}

function snapTime(raw: number, bpm: number, offset: number, div: number): number {
  if (bpm <= 0) return Math.max(0, raw);
  const beatDur = 60 / bpm;
  const rawBeat = (raw - offset) / beatDur;
  const snapped = Math.round(rawBeat * div) / div;
  return Math.max(0, snapped * beatDur + offset);
}

function timeToY(t: number, H: number, scrollY: number): number {
  return H - t * PPS + scrollY;
}

function yToTime(y: number, H: number, scrollY: number): number {
  return (H - y + scrollY) / PPS;
}

function hitTestNote(
  notes: Note[], x: number, y: number,
  H: number, scrollY: number, offsetX: number, laneW: number
): Note | null {
  for (const note of notes) {
    const ny = timeToY(note.time, H, scrollY);
    const nx = offsetX + (LANE_KEYS[note.lane] + 0.5) * laneW;
    if (Math.abs(x - nx) <= laneW * 0.42 && Math.abs(y - ny) <= NOTE_H) return note;
  }
  return null;
}

function findNote(
  notes: Note[], x: number, y: number,
  scrollY: number, canvasH: number, offsetX: number, laneW: number
): Note | null {
  let best: Note | null = null;
  let bestDist = Infinity;
  for (const note of notes) {
    const ny = timeToY(note.time, canvasH, scrollY);
    const nx = offsetX + (LANE_KEYS[note.lane] + 0.5) * laneW;
    if (Math.abs(y - ny) > NOTE_H && Math.abs(x - nx) > laneW * 0.45) continue;
    const dist = Math.abs(y - ny) + Math.abs(x - nx) * 0.5;
    if (dist < bestDist) { bestDist = dist; best = note; }
  }
  return best;
}

export const EditorTimeline: React.FC<Props> = ({
  chart, audioRef, isPlaying, audioDuration, division,
  onAddNote, onRemoveNote,
  longNoteMode, pendingLongNoteStartId, onLongNoteClick,
  selectionMode, selectionRange, selectedNoteIds, onSelectionChange,
  pasteMode, clipboard, onPaste
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollYRef = useRef(0);
  const hoverRef = useRef<{ time: number; lane: Lane } | null>(null);
  const rafRef = useRef(0);

  // prop refs (RAF クロージャが古い値を参照しないよう)
  const chartRef = useRef(chart); chartRef.current = chart;
  const isPlayingRef = useRef(isPlaying); isPlayingRef.current = isPlaying;
  const divisionRef = useRef(division); divisionRef.current = division;
  const audioDurRef = useRef(audioDuration); audioDurRef.current = audioDuration;
  const longNoteModeRef = useRef(longNoteMode); longNoteModeRef.current = longNoteMode;
  const pendingStartIdRef = useRef(pendingLongNoteStartId); pendingStartIdRef.current = pendingLongNoteStartId;
  const selectionModeRef = useRef(selectionMode); selectionModeRef.current = selectionMode;
  const selectionRangeRef = useRef(selectionRange); selectionRangeRef.current = selectionRange;
  const selectedNoteIdsRef = useRef(selectedNoteIds); selectedNoteIdsRef.current = selectedNoteIds;
  const pasteModeRef = useRef(pasteMode); pasteModeRef.current = pasteMode;
  const clipboardRef = useRef(clipboard); clipboardRef.current = clipboard;

  // 選択ドラッグ状態
  const dragStartYRef = useRef<number | null>(null);
  const dragCurrentYRef = useRef(0);
  const wasDraggingRef = useRef(false);

  // ペーストプレビュー用: ホバー中の貼り付け予定時刻
  const pastePreviewTimeRef = useRef<number | null>(null);

  // Canvas リサイズ
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const observer = new ResizeObserver(() => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    });
    observer.observe(container);
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    return () => observer.disconnect();
  }, []);

  // RAF 描画ループ
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const c = chartRef.current;
      const dur = audioDurRef.current;
      const W = canvas.width;
      const H = canvas.height;
      if (W === 0 || H === 0) return;

      const ct = audioRef.current?.currentTime ?? 0;

      if (isPlayingRef.current) {
        scrollYRef.current = Math.max(0, ct * PPS - H * 0.3);
      }
      const scrollY = scrollYRef.current;
      const { laneW, offsetX, total } = getLaneGeom(W);
      const visStart = scrollY / PPS;
      const visEnd = (scrollY + H) / PPS;

      // ── Background ──
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#111118';
      ctx.fillRect(offsetX, 0, total, H);

      // ── 選択範囲オーバーレイ（確定済み）──
      const range = selectionRangeRef.current;
      if (range) {
        const ry1 = timeToY(range.endTime, H, scrollY);
        const ry2 = timeToY(range.startTime, H, scrollY);
        const rTop = Math.max(0, Math.min(ry1, ry2));
        const rBot = Math.min(H, Math.max(ry1, ry2));
        if (rBot > rTop) {
          ctx.fillStyle = 'rgba(100,120,255,0.12)';
          ctx.fillRect(offsetX, rTop, total, rBot - rTop);
          ctx.strokeStyle = 'rgba(100,120,255,0.45)';
          ctx.lineWidth = 1;
          ctx.strokeRect(offsetX, rTop, total, rBot - rTop);
        }
      }

      // ── ドラッグ中の仮選択矩形 ──
      if (selectionModeRef.current && dragStartYRef.current !== null && wasDraggingRef.current) {
        const dy1 = dragStartYRef.current;
        const dy2 = dragCurrentYRef.current;
        const dTop = Math.max(0, Math.min(dy1, dy2));
        const dBot = Math.min(H, Math.max(dy1, dy2));
        ctx.fillStyle = 'rgba(100,120,255,0.18)';
        ctx.fillRect(offsetX, dTop, total, dBot - dTop);
        ctx.strokeStyle = 'rgba(150,160,255,0.65)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 3]);
        ctx.strokeRect(offsetX, dTop, total, dBot - dTop);
        ctx.setLineDash([]);
      }

      // ── ビートグリッド ──
      if (c.bpm > 0) {
        const beatDur = 60 / c.bpm;
        const div = divisionRef.current;
        const firstBeat = Math.max(0, Math.floor((visStart - c.offset) / beatDur));
        const lastBeat = Math.ceil((visEnd - c.offset) / beatDur) + 1;

        for (let b = firstBeat; b <= lastBeat; b++) {
          const bt = b * beatDur + c.offset;
          if (bt < 0) continue;
          const by = timeToY(bt, H, scrollY);
          if (by < -2 || by > H + 2) continue;

          const isMeasure = b % 4 === 0;
          ctx.strokeStyle = isMeasure ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)';
          ctx.lineWidth = isMeasure ? 1.5 : 0.8;
          ctx.beginPath();
          ctx.moveTo(offsetX, by); ctx.lineTo(offsetX + total, by);
          ctx.stroke();

          if (isMeasure) {
            ctx.fillStyle = 'rgba(255,255,255,0.28)';
            ctx.font = '10px Arial';
            ctx.textAlign = 'right';
            ctx.fillText(String(Math.floor(b / 4) + 1), offsetX - 4, by + 4);
          }

          for (let d = 1; d < div; d++) {
            const st = bt + (d / div) * beatDur;
            const sy = timeToY(st, H, scrollY);
            if (sy < 0 || sy > H) continue;
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.5;
            ctx.beginPath();
            ctx.moveTo(offsetX, sy); ctx.lineTo(offsetX + total, sy);
            ctx.stroke();
          }
        }
      }

      // ── レーン区切り ──
      ctx.textAlign = 'left';
      for (let i = 0; i <= LANE_COUNT; i++) {
        const x = offsetX + i * laneW;
        ctx.strokeStyle = 'rgba(100,100,170,0.35)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, H);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(140,140,180,0.55)';
      ctx.font = 'bold 13px Arial';
      ctx.textAlign = 'center';
      LANES.forEach((lane, i) => {
        ctx.fillText(lane, offsetX + (i + 0.5) * laneW, H - 6);
      });
      ctx.textAlign = 'left';

      // ── ロングノーツバー（平行四辺形）──
      const longNoteEndIds = new Set(c.notes.filter(n => n.longNoteEndId).map(n => n.longNoteEndId!));
      const noteById = new Map(c.notes.map(n => [n.id, n]));
      for (const note of c.notes) {
        if (!note.longNoteEndId) continue;
        const endNote = noteById.get(note.longNoteEndId);
        if (!endNote) continue;
        const sy = timeToY(note.time, H, scrollY);
        const ey = timeToY(endNote.time, H, scrollY);
        if (Math.min(sy, ey) > H || Math.max(sy, ey) < 0) continue;
        const sx = offsetX + (LANE_KEYS[note.lane] + 0.5) * laneW;
        const ex = offsetX + (LANE_KEYS[endNote.lane] + 0.5) * laneW;
        const hw = laneW * 0.38;
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = LANE_COLORS[note.lane];
        ctx.beginPath();
        ctx.moveTo(sx - hw, sy); ctx.lineTo(sx + hw, sy);
        ctx.lineTo(ex + hw, ey); ctx.lineTo(ex - hw, ey);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // ── Notes ──
      for (const note of c.notes) {
        const ny = timeToY(note.time, H, scrollY);
        if (ny < -NOTE_H || ny > H + NOTE_H) continue;
        const idx = LANE_KEYS[note.lane];
        const nx = offsetX + (idx + 0.5) * laneW;
        const isEnd = longNoteEndIds.has(note.id);
        const isSelected = selectedNoteIdsRef.current.has(note.id);

        ctx.fillStyle = LANE_COLORS[note.lane];
        ctx.beginPath();
        ctx.roundRect(nx - laneW * 0.38, ny - NOTE_H / 2, laneW * 0.76, NOTE_H, 4);
        ctx.fill();

        // 終点ノーツ：点線ボーダー
        ctx.strokeStyle = isEnd ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.55)';
        ctx.lineWidth = isEnd ? 2 : 1.5;
        if (isEnd) ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.roundRect(nx - laneW * 0.38, ny - NOTE_H / 2, laneW * 0.76, NOTE_H, 4);
        ctx.stroke();
        ctx.setLineDash([]);

        // 選択中ノーツ：黄色ハイライトリング
        if (isSelected) {
          ctx.strokeStyle = '#ffe066';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.roundRect(nx - laneW * 0.43, ny - NOTE_H / 2 - 3, laneW * 0.86, NOTE_H + 6, 6);
          ctx.stroke();
        }
      }

      // ── ゴーストノート ──
      const hover = hoverRef.current;
      if (hover && !isPlayingRef.current && !longNoteModeRef.current
          && !selectionModeRef.current && !pasteModeRef.current) {
        const ny = timeToY(hover.time, H, scrollY);
        if (ny >= -NOTE_H && ny <= H + NOTE_H) {
          const nx = offsetX + (LANE_KEYS[hover.lane] + 0.5) * laneW;
          ctx.globalAlpha = 0.45;
          ctx.fillStyle = LANE_COLORS[hover.lane];
          ctx.beginPath();
          ctx.roundRect(nx - laneW * 0.38, ny - NOTE_H / 2, laneW * 0.76, NOTE_H, 4);
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      }

      // ── ロングノーツ選択ハイライト ──
      const pendingId = pendingStartIdRef.current;
      if (longNoteModeRef.current && pendingId) {
        const pn = c.notes.find(n => n.id === pendingId);
        if (pn) {
          const ny = timeToY(pn.time, H, scrollY);
          const nx = offsetX + (LANE_KEYS[pn.lane] + 0.5) * laneW;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 3;
          ctx.shadowColor = '#6666ff';
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.roundRect(nx - laneW * 0.44, ny - NOTE_H / 2 - 3, laneW * 0.88, NOTE_H + 6, 6);
          ctx.stroke();
          ctx.shadowBlur = 0;
        }
      }

      // ── ペーストプレビュー（クリップボードのゴーストノーツ）──
      const previewTime = pastePreviewTimeRef.current;
      if (pasteModeRef.current && previewTime !== null && clipboardRef.current.length > 0) {
        ctx.globalAlpha = 0.38;
        for (const n of clipboardRef.current) {
          const nt = previewTime + n.time;
          const ny = timeToY(nt, H, scrollY);
          if (ny < -NOTE_H || ny > H + NOTE_H) continue;
          const nx = offsetX + (LANE_KEYS[n.lane] + 0.5) * laneW;
          ctx.fillStyle = LANE_COLORS[n.lane];
          ctx.beginPath();
          ctx.roundRect(nx - laneW * 0.38, ny - NOTE_H / 2, laneW * 0.76, NOTE_H, 4);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
        // 貼り付け基点ライン
        const baseY = timeToY(previewTime, H, scrollY);
        if (baseY >= 0 && baseY <= H) {
          ctx.strokeStyle = 'rgba(255,230,100,0.6)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(offsetX, baseY); ctx.lineTo(offsetX + total, baseY);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── 再生ヘッド ──
      const phy = timeToY(ct, H, scrollY);
      if (phy >= 0 && phy <= H) {
        ctx.strokeStyle = '#ff4455';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(offsetX, phy); ctx.lineTo(offsetX + total, phy);
        ctx.stroke();
        const m = Math.floor(ct / 60);
        const s = (ct % 60).toFixed(2).padStart(5, '0');
        ctx.fillStyle = '#ff4455';
        ctx.font = 'bold 10px monospace';
        ctx.fillText(`${m}:${s}`, offsetX + total + 4, phy + 4);
      }

      // ── 音楽終端マーカー ──
      if (dur > 0) {
        const ey = timeToY(dur, H, scrollY);
        if (ey >= 0 && ey <= H) {
          ctx.strokeStyle = 'rgba(255,220,60,0.5)';
          ctx.lineWidth = 2;
          ctx.setLineDash([6, 4]);
          ctx.beginPath();
          ctx.moveTo(offsetX, ey); ctx.lineTo(offsetX + total, ey);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      // ── スクロールバー ──
      const maxScroll = Math.max((dur + 5) * PPS, H);
      const sbH = Math.max(40, H * (H / maxScroll));
      const sbY = (1 - scrollY / maxScroll) * (H - sbH);
      ctx.fillStyle = 'rgba(100,100,180,0.25)';
      ctx.beginPath();
      ctx.roundRect(W - 5, sbY, 4, sbH, 2);
      ctx.fill();
    };

    const loop = () => { draw(); rafRef.current = requestAnimationFrame(loop); };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef]);

  // ── ホイールスクロール ──
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const dur = audioDurRef.current;
    const maxScroll = Math.max((dur + 5) * PPS, 300);
    scrollYRef.current = Math.max(0, Math.min(maxScroll, scrollYRef.current - e.deltaY));
  }, []);

  // ── MouseDown（選択ドラッグ開始）──
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (!selectionModeRef.current) return;
    const rect = canvasRef.current!.getBoundingClientRect();
    dragStartYRef.current = e.clientY - rect.top;
    dragCurrentYRef.current = e.clientY - rect.top;
    wasDraggingRef.current = false;
  }, []);

  // ── MouseMove ──
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { laneW, offsetX } = getLaneGeom(canvas.width);

    // 選択ドラッグ追従
    if (selectionModeRef.current && dragStartYRef.current !== null) {
      dragCurrentYRef.current = y;
      if (Math.abs(y - dragStartYRef.current) > 4) wasDraggingRef.current = true;
      return;
    }

    // ペーストプレビュー時刻
    if (pasteModeRef.current) {
      const raw = yToTime(y, canvas.height, scrollYRef.current);
      pastePreviewTimeRef.current = snapTime(raw, chartRef.current.bpm, chartRef.current.offset, divisionRef.current);
      return;
    }

    // ゴーストノート（通常モードのみ）
    if (isPlayingRef.current || longNoteModeRef.current || selectionModeRef.current) {
      hoverRef.current = null;
      return;
    }
    const li = Math.floor((x - offsetX) / laneW);
    if (li < 0 || li >= LANE_COUNT) { hoverRef.current = null; return; }
    const raw = yToTime(y, canvas.height, scrollYRef.current);
    const c = chartRef.current;
    const snapped = snapTime(raw, c.bpm, c.offset, divisionRef.current);
    hoverRef.current = { time: snapped, lane: LANES[li] };
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoverRef.current = null;
    pastePreviewTimeRef.current = null;
  }, []);

  // ── MouseUp（選択ドラッグ確定）──
  const handleMouseUp = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    if (!selectionModeRef.current || dragStartYRef.current === null) return;

    if (wasDraggingRef.current) {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const currentY = e.clientY - rect.top;
      const t1 = yToTime(dragStartYRef.current, canvas.height, scrollYRef.current);
      const t2 = yToTime(currentY, canvas.height, scrollYRef.current);
      onSelectionChange({ startTime: Math.min(t1, t2), endTime: Math.max(t1, t2) });
    }

    dragStartYRef.current = null;
  }, [onSelectionChange]);

  // ── Click ──
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;

    // ドラッグ完了直後はクリックを無視
    if (wasDraggingRef.current) {
      wasDraggingRef.current = false;
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { laneW, offsetX } = getLaneGeom(canvas.width);

    // ペーストモード：クリック位置にペースト
    if (pasteModeRef.current) {
      const raw = yToTime(y, canvas.height, scrollYRef.current);
      const snapped = snapTime(raw, chartRef.current.bpm, chartRef.current.offset, divisionRef.current);
      onPaste(snapped);
      return;
    }

    // ロングノーツ作成モード
    if (longNoteModeRef.current) {
      const hit = hitTestNote(chartRef.current.notes, x, y, canvas.height, scrollYRef.current, offsetX, laneW);
      onLongNoteClick(hit ? hit.id : null);
      return;
    }

    // 選択モード：クリックで選択解除
    if (selectionModeRef.current) {
      onSelectionChange(null);
      return;
    }

    // 通常モード：ノーツ配置 / 削除トグル
    const li = Math.floor((x - offsetX) / laneW);
    if (li < 0 || li >= LANE_COUNT) return;
    const c = chartRef.current;
    const raw = yToTime(y, canvas.height, scrollYRef.current);
    const snapped = snapTime(raw, c.bpm, c.offset, divisionRef.current);
    const beatDur = c.bpm > 0 ? 60 / c.bpm : 0.5;
    const snapGap = beatDur / divisionRef.current;
    const existing = c.notes.find(
      n => n.lane === LANES[li] && Math.abs(n.time - snapped) < snapGap * 0.3
    );
    if (existing) onRemoveNote(existing.id);
    else onAddNote(snapped, LANES[li]);
  }, [onAddNote, onRemoveNote, onLongNoteClick, onSelectionChange, onPaste]);

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const { laneW, offsetX } = getLaneGeom(canvas.width);
    const note = findNote(chartRef.current.notes, x, y, scrollYRef.current, canvas.height, offsetX, laneW);
    if (note) onRemoveNote(note.id);
  }, [onRemoveNote]);

  const cursor = pasteMode ? 'copy' : longNoteMode ? 'pointer' : selectionMode ? 'crosshair' : 'crosshair';

  return (
    <div ref={containerRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', minWidth: 0 }}>
      <canvas
        ref={canvasRef}
        style={{ display: 'block', cursor, width: '100%', height: '100%' }}
        onMouseDown={handleMouseDown}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        onWheel={handleWheel}
      />
    </div>
  );
};
