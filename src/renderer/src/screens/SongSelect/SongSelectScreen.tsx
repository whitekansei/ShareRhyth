import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ChartMeta } from '../../types/chart';
import { SAMPLE_CHART } from './SampleChartInstaller';
import type { OnlineChartMeta } from '../../lib/chartShare';
import { GameSettingsModal } from './GameSettingsModal';

type Tab = 'local' | 'online';

// ── 順序・削除の localStorage 管理 ──
const ORDER_KEY = 'sharerhyth_chart_order';
const DELETED_KEY = 'sharerhyth_deleted_charts';

function loadOrder(): string[] {
  try { return JSON.parse(localStorage.getItem(ORDER_KEY) ?? '[]') as string[]; }
  catch { return []; }
}

function saveOrder(ids: string[]): void {
  localStorage.setItem(ORDER_KEY, JSON.stringify(ids));
}

function loadDeletedIds(): string[] {
  try { return JSON.parse(localStorage.getItem(DELETED_KEY) ?? '[]') as string[]; }
  catch { return []; }
}

function markDeleted(id: string): void {
  const list = loadDeletedIds();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(DELETED_KEY, JSON.stringify(list));
  }
}

function applyOrder(charts: ChartMeta[], order: string[]): ChartMeta[] {
  if (order.length === 0) return charts;
  const map = new Map(charts.map(c => [c.id, c]));
  const result: ChartMeta[] = [];
  for (const id of order) {
    const c = map.get(id);
    if (c) result.push(c);
  }
  for (const c of charts) {
    if (!result.find(r => r.id === c.id)) result.push(c);
  }
  return result;
}

// ── ボタンの共通スタイルヘルパー ──
const iconBtn = (disabled: boolean, danger = false): React.CSSProperties => ({
  background: 'none',
  border: 'none',
  color: disabled ? '#2a2a3a' : danger ? '#884444' : '#555',
  cursor: disabled ? 'default' : 'pointer',
  fontSize: 11,
  padding: '2px 5px',
  lineHeight: 1,
  borderRadius: 3,
  transition: 'color 0.15s'
});

export const SongSelectScreen: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>('local');

  // ── Local charts ──
  const [charts, setCharts] = useState<ChartMeta[]>([]);
  const [selected, setSelected] = useState<ChartMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Online charts ──
  const [onlineCharts, setOnlineCharts] = useState<OnlineChartMeta[]>([]);
  const [onlineLoading, setOnlineLoading] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const loadCharts = useCallback(async () => {
    setLoading(true);
    try {
      const chartsDir = await window.electronAPI.charts.getDir();
      const destFolder = chartsDir + '/sample-song';
      // 削除済みでなければサンプルをインストール
      if (!loadDeletedIds().includes('sample-song')) {
        await window.electronAPI.chart.save(destFolder, SAMPLE_CHART);
      }
      const list = await window.electronAPI.chart.list();
      const ordered = applyOrder(list, loadOrder());
      setCharts(ordered);
      if (ordered.length > 0) setSelected(prev => prev ?? ordered[0]);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadCharts(); }, [loadCharts]);

  const loadOnlineCharts = useCallback(async () => {
    setOnlineLoading(true);
    setOnlineError(null);
    try {
      const { fetchOnlineCharts } = await import('../../lib/chartShare');
      const list = await fetchOnlineCharts();
      setOnlineCharts(list);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';
      setOnlineError(msg);
    }
    setOnlineLoading(false);
  }, []);

  useEffect(() => {
    if (tab === 'online') loadOnlineCharts();
  }, [tab, loadOnlineCharts]);

  // ── Handlers ──
  const handlePlay = useCallback(async () => {
    if (!selected) return;
    const chart = await window.electronAPI.chart.load(selected.folderPath);
    navigate('/play', { state: { chart, folderPath: selected.folderPath } });
  }, [selected, navigate]);

  const handleEditSelected = useCallback(async () => {
    if (!selected) return;
    const chart = await window.electronAPI.chart.load(selected.folderPath);
    navigate('/editor', { state: { chart, folderPath: selected.folderPath } });
  }, [selected, navigate]);

  const handleNewChart = useCallback(() => {
    navigate('/editor');
  }, [navigate]);

  const handleAddFolder = useCallback(async () => {
    const folder = await window.electronAPI.dialog.openChartFolder();
    if (!folder) return;
    try {
      const chart = await window.electronAPI.chart.load(folder);
      const chartsDir = await window.electronAPI.charts.getDir();
      const id = chart.title.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now();
      const destFolder = chartsDir + '/' + id;
      await window.electronAPI.chart.save(destFolder, chart);
      await loadCharts();
    } catch {
      alert('chart.json が見つかりませんでした。');
    }
  }, [loadCharts]);

  const moveChart = useCallback((id: string, direction: -1 | 1) => {
    setCharts(prev => {
      const idx = prev.findIndex(c => c.id === id);
      if (idx < 0) return prev;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      saveOrder(next.map(c => c.id));
      return next;
    });
  }, []);

  const handleDeleteConfirm = useCallback(async (chart: ChartMeta) => {
    markDeleted(chart.id);
    await window.electronAPI.chart.delete(chart.folderPath);
    setCharts(prev => {
      const next = prev.filter(c => c.id !== chart.id);
      saveOrder(next.map(c => c.id));
      return next;
    });
    setSelected(prev => prev?.id === chart.id ? null : prev);
    setDeletingId(null);
  }, []);

  const handleDownload = useCallback(async (onlineChart: OnlineChartMeta) => {
    setDownloading(onlineChart.id);
    setDownloadMsg(null);
    try {
      const { downloadChart } = await import('../../lib/chartShare');
      await downloadChart(onlineChart.id);
      setDownloadMsg({ id: onlineChart.id, ok: true, text: 'ダウンロード完了！' });
      await loadCharts();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : '不明なエラー';
      setDownloadMsg({ id: onlineChart.id, ok: false, text: msg });
    }
    setDownloading(null);
  }, [loadCharts]);

  // ── Styles ──
  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '10px 0',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    border: 'none',
    borderBottom: active ? '2px solid #6666ff' : '2px solid transparent',
    background: 'transparent',
    color: active ? '#6666ff' : '#666',
    letterSpacing: 1
  });

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0a0a0f', display: 'flex', color: '#fff', fontFamily: 'Arial, sans-serif' }}>
      {showSettings && <GameSettingsModal onClose={() => setShowSettings(false)} />}

      {/* ── Left column ── */}
      <div style={{ width: 360, borderRight: '1px solid #333355', display: 'flex', flexDirection: 'column' }}>

        {/* Title */}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #333355' }}>
          <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: 4, color: '#6666ff' }}>ShareRhyth</span>
          <button
            onClick={() => setShowSettings(true)}
            title="ゲーム設定"
            style={{
              background: 'transparent',
              border: '1px solid #333355',
              color: '#888',
              borderRadius: 4,
              padding: '4px 10px',
              fontSize: 13,
              cursor: 'pointer',
              letterSpacing: 1
            }}
          >
            ⚙ 設定
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #333355' }}>
          <button style={tabBtn(tab === 'local')} onClick={() => setTab('local')}>マイ譜面</button>
          <button style={tabBtn(tab === 'online')} onClick={() => setTab('online')}>オンライン</button>
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {tab === 'local' && (
            loading ? (
              <div style={{ padding: 24, color: '#aaa' }}>Loading...</div>
            ) : charts.length === 0 ? (
              <div style={{ padding: 24, color: '#aaa', fontSize: 13 }}>
                譜面がありません<br />
                <span style={{ fontSize: 11, color: '#555' }}>「新規作成」から譜面を作成してください</span>
              </div>
            ) : (
              charts.map((c, idx) => {
                const isSelected = selected?.id === c.id;
                const isDeleting = deletingId === c.id;
                return (
                  <div
                    key={c.id}
                    style={{
                      borderBottom: '1px solid #1a1a2e',
                      background: isSelected ? '#1e1e3f' : 'transparent',
                      borderLeft: isSelected ? '3px solid #6666ff' : '3px solid transparent'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'stretch' }}>
                      {/* 選択エリア */}
                      <div
                        onClick={() => { if (!isDeleting) setSelected(c); }}
                        style={{ flex: 1, padding: '14px 8px 14px 21px', cursor: isDeleting ? 'default' : 'pointer' }}
                      >
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.title}</div>
                        <div style={{ color: '#888', fontSize: 12 }}>{c.artist}</div>
                        <div style={{ color: '#666', fontSize: 11, marginTop: 2 }}>BPM {c.bpm}</div>
                      </div>

                      {/* 操作ボタン */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 8px', gap: 1 }}>
                        <button
                          onClick={() => moveChart(c.id, -1)}
                          disabled={idx === 0}
                          title="上へ移動"
                          style={iconBtn(idx === 0)}
                        >▲</button>
                        <button
                          onClick={() => moveChart(c.id, 1)}
                          disabled={idx === charts.length - 1}
                          title="下へ移動"
                          style={iconBtn(idx === charts.length - 1)}
                        >▼</button>
                        <button
                          onClick={() => setDeletingId(isDeleting ? null : c.id)}
                          title="削除"
                          style={{ ...iconBtn(false, true), marginTop: 4, fontSize: 13 }}
                        >🗑</button>
                      </div>
                    </div>

                    {/* 削除確認 */}
                    {isDeleting && (
                      <div style={{
                        padding: '6px 12px 10px 24px',
                        background: '#160808',
                        display: 'flex', alignItems: 'center', gap: 8
                      }}>
                        <span style={{ color: '#ff9999', fontSize: 11, flex: 1 }}>
                          「{c.title}」を削除しますか？
                        </span>
                        <button
                          onClick={() => handleDeleteConfirm(c)}
                          style={{
                            padding: '3px 12px', fontSize: 11, fontWeight: 700,
                            background: '#cc2222', border: 'none', color: '#fff',
                            borderRadius: 3, cursor: 'pointer'
                          }}
                        >削除</button>
                        <button
                          onClick={() => setDeletingId(null)}
                          style={{
                            padding: '3px 12px', fontSize: 11,
                            background: 'transparent', border: '1px solid #555', color: '#aaa',
                            borderRadius: 3, cursor: 'pointer'
                          }}
                        >キャンセル</button>
                      </div>
                    )}
                  </div>
                );
              })
            )
          )}

          {tab === 'online' && (
            onlineLoading ? (
              <div style={{ padding: 24, color: '#aaa' }}>読み込み中...</div>
            ) : onlineError ? (
              <div style={{ padding: 24 }}>
                <div style={{ color: '#ff6666', fontSize: 12, marginBottom: 12 }}>{onlineError}</div>
                <button
                  onClick={loadOnlineCharts}
                  style={{ fontSize: 12, color: '#aaa', background: 'transparent', border: '1px solid #555', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}
                >
                  再試行
                </button>
              </div>
            ) : onlineCharts.length === 0 ? (
              <div style={{ padding: 24, color: '#aaa', fontSize: 13 }}>オンライン譜面がありません</div>
            ) : (
              onlineCharts.map(oc => (
                <div key={oc.id} style={{ padding: '12px 16px', borderBottom: '1px solid #1a1a2e' }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{oc.title}</div>
                  <div style={{ color: '#888', fontSize: 11 }}>{oc.artist} · BPM {oc.bpm}</div>
                  <div style={{ color: '#555', fontSize: 10, marginTop: 2 }}>
                    by {oc.uploader} · ↓ {oc.downloads}
                    {oc.has_audio ? '' : ' · 音楽なし'}
                  </div>
                  <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                      onClick={() => handleDownload(oc)}
                      disabled={downloading === oc.id}
                      style={{
                        fontSize: 11, padding: '4px 12px', borderRadius: 4, cursor: 'pointer',
                        background: downloading === oc.id ? '#333' : '#6666ff',
                        border: 'none', color: '#fff', fontWeight: 700
                      }}
                    >
                      {downloading === oc.id ? '...' : 'ダウンロード'}
                    </button>
                    {downloadMsg?.id === oc.id && (
                      <span style={{ fontSize: 11, color: downloadMsg.ok ? '#99ff99' : '#ff6666' }}>
                        {downloadMsg.text}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Buttons at bottom */}
        {tab === 'local' && (
          <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid #1a1a2e' }}>
            <button
              onClick={handleNewChart}
              style={{ padding: '9px 0', background: '#6666ff', border: 'none', color: '#fff', borderRadius: 4, cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              ＋ 新規作成
            </button>
            <button
              onClick={handleAddFolder}
              style={{ padding: '8px 0', background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              フォルダを追加
            </button>
          </div>
        )}
        {tab === 'online' && (
          <div style={{ padding: '10px 16px', borderTop: '1px solid #1a1a2e' }}>
            <button
              onClick={loadOnlineCharts}
              style={{ width: '100%', padding: '8px 0', background: 'transparent', border: '1px solid #555', color: '#aaa', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              ↺ 更新
            </button>
          </div>
        )}
      </div>

      {/* ── Right: detail ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
        {selected && tab === 'local' ? (
          <>
            <div style={{ fontSize: 13, color: '#aaa', letterSpacing: 2 }}>{selected.artist}</div>
            <div style={{ fontSize: 36, fontWeight: 900 }}>{selected.title}</div>
            <div style={{ color: '#666', fontSize: 14 }}>BPM {selected.bpm}</div>

            <button
              onClick={handlePlay}
              style={{
                marginTop: 24,
                padding: '16px 64px',
                fontSize: 22,
                fontWeight: 900,
                letterSpacing: 6,
                color: '#0a0a0f',
                background: '#6666ff',
                border: 'none',
                borderRadius: 8,
                cursor: 'pointer',
                boxShadow: '0 0 24px #6666ff88'
              }}
              onMouseEnter={e => ((e.target as HTMLElement).style.transform = 'scale(1.05)')}
              onMouseLeave={e => ((e.target as HTMLElement).style.transform = 'scale(1)')}
            >
              PLAY
            </button>

            <button
              onClick={handleEditSelected}
              style={{ padding: '10px 36px', fontSize: 14, fontWeight: 700, color: '#aaa', background: 'transparent', border: '1px solid #555', borderRadius: 6, cursor: 'pointer' }}
            >
              エディタで編集
            </button>

            <div style={{ color: '#444', fontSize: 12 }}>ESC でポーズ</div>
          </>
        ) : tab === 'local' ? (
          <div style={{ color: '#555' }}>左のリストから曲を選択してください</div>
        ) : (
          <div style={{ color: '#555', textAlign: 'center' }}>
            <div style={{ fontSize: 16, marginBottom: 8 }}>オンライン譜面</div>
            <div style={{ fontSize: 12, color: '#444' }}>左のリストから譜面を選んでダウンロード</div>
          </div>
        )}
      </div>
    </div>
  );
};
