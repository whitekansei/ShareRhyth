import { contextBridge, ipcRenderer } from 'electron';
import type { Chart, ChartMeta } from '../types/chart';

contextBridge.exposeInMainWorld('electronAPI', {
  chart: {
    list: (): Promise<ChartMeta[]> => ipcRenderer.invoke('chart:list'),
    load: (folderPath: string): Promise<Chart> => ipcRenderer.invoke('chart:load', folderPath),
    save: (folderPath: string, chart: Chart): Promise<void> =>
      ipcRenderer.invoke('chart:save', folderPath, chart),
    copyAudio: (srcPath: string, destFolder: string): Promise<string> =>
      ipcRenderer.invoke('chart:copyAudio', srcPath, destFolder),
    openFolder: (folderPath: string): Promise<void> =>
      ipcRenderer.invoke('chart:openFolder', folderPath),
    delete: (folderPath: string): Promise<void> =>
      ipcRenderer.invoke('chart:delete', folderPath)
  },
  audio: {
    getPath: (folderPath: string, audioFile: string): Promise<string> =>
      ipcRenderer.invoke('audio:getPath', folderPath, audioFile),
    readFile: (absolutePath: string): Promise<Uint8Array> =>
      ipcRenderer.invoke('audio:readFile', absolutePath)
  },
  dialog: {
    openAudioFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openAudioFile'),
    openChartFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:openChartFolder')
  },
  charts: {
    getDir: (): Promise<string> => ipcRenderer.invoke('charts:getDir')
  },
  file: {
    saveBase64: (folderPath: string, fileName: string, base64: string): Promise<void> =>
      ipcRenderer.invoke('file:saveBase64', folderPath, fileName, base64)
  }
});
