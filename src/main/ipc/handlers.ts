import { ipcMain, dialog, app, shell } from 'electron';
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import type { Chart, ChartMeta } from '../../types/chart';

const chartsDir = (): string => join(app.getPath('userData'), 'charts');

function ensureChartsDir(): void {
  const dir = chartsDir();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export function registerIpcHandlers(): void {
  ensureChartsDir();

  ipcMain.handle('chart:list', (): ChartMeta[] => {
    const dir = chartsDir();
    if (!existsSync(dir)) return [];
    const entries = readdirSync(dir, { withFileTypes: true });
    const metas: ChartMeta[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const chartPath = join(dir, entry.name, 'chart.json');
      if (!existsSync(chartPath)) continue;
      try {
        const chart: Chart = JSON.parse(readFileSync(chartPath, 'utf-8'));
        metas.push({
          id: entry.name,
          title: chart.title,
          artist: chart.artist,
          bpm: chart.bpm,
          folderPath: join(dir, entry.name)
        });
      } catch {
        // skip malformed charts
      }
    }
    return metas;
  });

  ipcMain.handle('chart:load', (_event, folderPath: string): Chart => {
    const chartPath = join(folderPath, 'chart.json');
    return JSON.parse(readFileSync(chartPath, 'utf-8'));
  });

  ipcMain.handle('chart:save', (_event, folderPath: string, chart: Chart): void => {
    if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true });
    const chartPath = join(folderPath, 'chart.json');
    writeFileSync(chartPath, JSON.stringify(chart, null, 2), 'utf-8');
  });

  ipcMain.handle('audio:getPath', (_event, folderPath: string, audioFile: string): string => {
    return join(folderPath, audioFile);
  });

  ipcMain.handle('dialog:openAudioFile', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({
      filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a'] }],
      properties: ['openFile']
    });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('dialog:openChartFolder', async (): Promise<string | null> => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return result.canceled ? null : result.filePaths[0];
  });

  ipcMain.handle('charts:getDir', (): string => chartsDir());

  ipcMain.handle('chart:copyAudio', async (_event, srcPath: string, destFolder: string): Promise<string> => {
    const { copyFileSync } = await import('fs');
    const { basename } = await import('path');
    const fileName = basename(srcPath);
    const destPath = join(destFolder, fileName);
    if (!existsSync(destFolder)) mkdirSync(destFolder, { recursive: true });
    copyFileSync(srcPath, destPath);
    return fileName;
  });

  ipcMain.handle('path:dirname', (_event, p: string): string => dirname(p));

  // 音声ファイルをバイナリで読み込む（renderer から file:// を fetch できない問題を回避）
  ipcMain.handle('audio:readFile', (_event, absolutePath: string): Uint8Array => {
    const buf = readFileSync(absolutePath);
    return new Uint8Array(buf);
  });

  // チャートフォルダをファイルエクスプローラで開く
  ipcMain.handle('chart:openFolder', (_event, folderPath: string): void => {
    shell.openPath(folderPath);
  });

  ipcMain.handle('chart:delete', (_event, folderPath: string): void => {
    if (existsSync(folderPath)) rmSync(folderPath, { recursive: true, force: true });
  });

  // base64 エンコードされたバイナリをファイルとして保存（ダウンロードした音声ファイル保存用）
  ipcMain.handle('file:saveBase64', (_event, folderPath: string, fileName: string, base64: string): void => {
    const buf = Buffer.from(base64, 'base64');
    if (!existsSync(folderPath)) mkdirSync(folderPath, { recursive: true });
    writeFileSync(join(folderPath, fileName), buf);
  });
}
