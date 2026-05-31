import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type { Chart, Note, Lane } from '../../types/chart';

const DEFAULT_CHART: Chart = {
  version: 1,
  title: '新しい譜面',
  artist: '',
  bpm: 120,
  audioFile: '',
  offset: 0,
  notes: []
};

export function useEditor(initial?: { chart: Chart; folderPath: string }) {
  const [chart, setChart] = useState<Chart>(() =>
    initial?.chart ? { ...initial.chart, notes: [...initial.chart.notes] } : { ...DEFAULT_CHART }
  );
  const [folderPath, setFolderPath] = useState<string | null>(initial?.folderPath ?? null);
  const [isDirty, setIsDirty] = useState(false);

  const undoStackRef = useRef<Note[][]>([]);
  const redoStackRef = useRef<Note[][]>([]);

  const pushUndo = useCallback((prevNotes: Note[]) => {
    undoStackRef.current.push([...prevNotes]);
    if (undoStackRef.current.length > 100) undoStackRef.current.shift();
    redoStackRef.current = [];
  }, []);

  const addNote = useCallback((time: number, lane: Lane) => {
    setChart(prev => {
      pushUndo(prev.notes);
      const newNote: Note = { id: uuidv4(), time, lane };
      const notes = [...prev.notes, newNote].sort((a, b) => a.time - b.time);
      return { ...prev, notes };
    });
    setIsDirty(true);
  }, [pushUndo]);

  const removeNote = useCallback((id: string) => {
    setChart(prev => {
      pushUndo(prev.notes);
      return {
        ...prev,
        notes: prev.notes
          .filter(n => n.id !== id)
          // 削除されたノーツを参照しているロングノーツ結合を解除
          .map(n => n.longNoteEndId === id ? { ...n, longNoteEndId: undefined } : n)
      };
    });
    setIsDirty(true);
  }, [pushUndo]);

  const updateMeta = useCallback((fields: Partial<Omit<Chart, 'notes' | 'version'>>) => {
    setChart(prev => {
      // オフセット変更時は既存ノーツをΔだけシフトしてビート位置を維持する
      if (fields.offset !== undefined && fields.offset !== prev.offset && prev.notes.length > 0) {
        const delta = fields.offset - prev.offset;
        pushUndo(prev.notes);
        const notes = prev.notes.map(n => ({ ...n, time: Math.max(0, n.time + delta) }));
        return { ...prev, ...fields, notes };
      }
      return { ...prev, ...fields };
    });
    setIsDirty(true);
  }, [pushUndo]);

  // 2つのノーツをロングノーツとして連結する（時刻の早い方が始点）
  const setLongNote = useCallback((id1: string, id2: string) => {
    setChart(prev => {
      const n1 = prev.notes.find(n => n.id === id1);
      const n2 = prev.notes.find(n => n.id === id2);
      if (!n1 || !n2 || id1 === id2) return prev;
      const [startId, endId] = n1.time <= n2.time ? [id1, id2] : [id2, id1];
      pushUndo(prev.notes);
      return {
        ...prev,
        notes: prev.notes.map(n =>
          n.id === startId ? { ...n, longNoteEndId: endId } : n
        )
      };
    });
    setIsDirty(true);
  }, [pushUndo]);

  // ロングノーツの連結を解除する（始点ID・終点IDどちらでも可）
  const clearLongNote = useCallback((id: string) => {
    setChart(prev => {
      pushUndo(prev.notes);
      return {
        ...prev,
        notes: prev.notes.map(n => {
          if (n.id === id && n.longNoteEndId) return { ...n, longNoteEndId: undefined };
          if (n.longNoteEndId === id) return { ...n, longNoteEndId: undefined };
          return n;
        })
      };
    });
    setIsDirty(true);
  }, [pushUndo]);

  const undo = useCallback(() => {
    setChart(prev => {
      const prevNotes = undoStackRef.current.pop();
      if (!prevNotes) return prev;
      redoStackRef.current.push([...prev.notes]);
      return { ...prev, notes: prevNotes };
    });
    setIsDirty(true);
  }, []);

  const redo = useCallback(() => {
    setChart(prev => {
      const nextNotes = redoStackRef.current.pop();
      if (!nextNotes) return prev;
      undoStackRef.current.push([...prev.notes]);
      return { ...prev, notes: nextNotes };
    });
    setIsDirty(true);
  }, []);

  // 相対時刻で渡されたノーツを pasteStartTime を基点として貼り付ける
  const pasteNotes = useCallback((pasteStartTime: number, notesToPaste: Note[]) => {
    if (notesToPaste.length === 0) return;
    setChart(prev => {
      pushUndo(prev.notes);
      // 新 ID を割り当て、ロングノーツ接続も内部で再マッピング
      const idMap = new Map(notesToPaste.map(n => [n.id, uuidv4()]));
      const newNotes: Note[] = notesToPaste.map(n => ({
        ...n,
        id: idMap.get(n.id)!,
        time: Math.max(0, pasteStartTime + n.time),
        longNoteEndId: n.longNoteEndId && idMap.has(n.longNoteEndId)
          ? idMap.get(n.longNoteEndId)
          : undefined
      }));
      const all = [...prev.notes, ...newNotes].sort((a, b) => a.time - b.time);
      return { ...prev, notes: all };
    });
    setIsDirty(true);
  }, [pushUndo]);

  const markSaved = useCallback(() => setIsDirty(false), []);

  return {
    chart,
    folderPath,
    isDirty,
    setFolderPath,
    addNote,
    removeNote,
    updateMeta,
    setLongNote,
    clearLongNote,
    pasteNotes,
    undo,
    redo,
    markSaved
  };
}
