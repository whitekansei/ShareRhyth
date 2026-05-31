/*
 * Supabase セットアップ (初回のみ Supabase SQL エディタで実行)
 *
 * create extension if not exists "uuid-ossp";
 *
 * create table if not exists public.charts (
 *   id          uuid        primary key default uuid_generate_v4(),
 *   title       text        not null,
 *   artist      text        not null,
 *   bpm         integer     not null,
 *   uploader    text        not null default 'anonymous',
 *   created_at  timestamptz not null default now(),
 *   chart_json  jsonb       not null,
 *   audio_path  text,
 *   downloads   bigint      not null default 0
 * );
 * alter table public.charts enable row level security;
 * create policy "public read"   on public.charts for select using (true);
 * create policy "public insert" on public.charts for insert with check (true);
 * create policy "public update" on public.charts for update using (true) with check (true);
 *
 * Storage: "chart-audio" バケットをダッシュボードで作成し Public に設定
 */

import { supabase, isSupabaseConfigured } from './supabase';
import type { Chart } from '../types/chart';

export interface OnlineChartMeta {
  id: string;
  title: string;
  artist: string;
  bpm: number;
  uploader: string;
  created_at: string;
  downloads: number;
  has_audio: boolean;
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase が設定されていません。.env ファイルを確認してください。');
  return supabase;
}

export async function uploadChart(
  chart: Chart,
  folderPath: string,
  uploader = 'anonymous'
): Promise<string> {
  const sb = requireSupabase();

  // 既存レコードがある場合は UPDATE を試みる（音声は再アップロードしない）
  if (chart.shareId) {
    const { data, error } = await sb
      .from('charts')
      .update({
        title: chart.title,
        artist: chart.artist,
        bpm: chart.bpm,
        uploader,
        chart_json: chart
      })
      .eq('id', chart.shareId)
      .select('id');
    if (error) throw new Error(`譜面の更新に失敗: ${error.message}`);
    // UPDATE が 1 件以上成功した場合はそのまま返す
    if (data && data.length > 0) return chart.shareId;
    // 0 件（DB 側でレコードが消えている）→ INSERT にフォールバック
  }

  // 初回: 音声をアップロードしてから INSERT
  let audioPath: string | null = null;
  if (chart.audioFile) {
    const absPath = await window.electronAPI.audio.getPath(folderPath, chart.audioFile);
    const bytes = await window.electronAPI.audio.readFile(absPath);
    const ext = chart.audioFile.split('.').pop() ?? 'mp3';
    const blob = new Blob([bytes], { type: `audio/${ext}` });
    const storageName = `${Date.now()}_${chart.title.replace(/[^a-zA-Z0-9_-]/g, '_')}.${ext}`;

    const { data, error } = await sb.storage
      .from('chart-audio')
      .upload(storageName, blob, { contentType: `audio/${ext}`, upsert: false });
    if (error) throw new Error(`音声ファイルのアップロードに失敗: ${error.message}`);
    audioPath = data.path;
  }

  const { data, error } = await sb
    .from('charts')
    .insert({
      title: chart.title,
      artist: chart.artist,
      bpm: chart.bpm,
      uploader,
      chart_json: chart,
      audio_path: audioPath
    })
    .select('id')
    .single();

  if (error) throw new Error(`譜面のアップロードに失敗: ${error.message}`);
  return (data as { id: string }).id;
}

export async function fetchOnlineCharts(): Promise<OnlineChartMeta[]> {
  if (!isSupabaseConfigured) return [];
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('charts')
    .select('id, title, artist, bpm, uploader, created_at, downloads, audio_path')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return ((data as Array<{
    id: string; title: string; artist: string; bpm: number;
    uploader: string; created_at: string; downloads: number; audio_path: string | null;
  }>) ?? []).map(r => ({
    id: r.id,
    title: r.title,
    artist: r.artist,
    bpm: r.bpm,
    uploader: r.uploader,
    created_at: r.created_at,
    downloads: r.downloads,
    has_audio: !!r.audio_path
  }));
}

export async function downloadChart(id: string): Promise<void> {
  const sb = requireSupabase();
  const { data, error } = await sb
    .from('charts')
    .select('chart_json, audio_path')
    .eq('id', id)
    .single();
  if (error) throw new Error(error.message);

  const row = data as { chart_json: Chart; audio_path: string | null };
  const chart: Chart = row.chart_json;
  const chartsDir = await window.electronAPI.charts.getDir();
  const folderId = chart.title.replace(/[^a-zA-Z0-9_-]/g, '_') + '_' + Date.now();
  const folderPath = chartsDir + '/' + folderId;

  await window.electronAPI.chart.save(folderPath, chart);

  if (row.audio_path && chart.audioFile) {
    const { data: urlData } = sb.storage
      .from('chart-audio')
      .getPublicUrl(row.audio_path);
    const res = await fetch(urlData.publicUrl);
    if (!res.ok) throw new Error('音声ファイルのダウンロードに失敗しました');
    const arrayBuf = await res.arrayBuffer();
    const uint8 = new Uint8Array(arrayBuf);

    // Uint8Array → base64 (chunk to avoid call stack overflow)
    let binary = '';
    for (let i = 0; i < uint8.length; i += 8192) {
      binary += String.fromCharCode(...uint8.subarray(i, i + 8192));
    }
    const base64 = btoa(binary);
    await window.electronAPI.file.saveBase64(folderPath, chart.audioFile, base64);
  }

  // Increment download counter (fire-and-forget)
  sb.from('charts')
    .update({ downloads: (data as { chart_json: Chart; audio_path: string | null; downloads?: number }).downloads ?? 0 + 1 })
    .eq('id', id)
    .then(() => {});
}
