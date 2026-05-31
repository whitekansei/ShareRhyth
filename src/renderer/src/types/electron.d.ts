import type { Chart, ChartMeta } from './chart';

declare global {
  interface Window {
    electronAPI: {
      chart: {
        list(): Promise<ChartMeta[]>;
        load(folderPath: string): Promise<Chart>;
        save(folderPath: string, chart: Chart): Promise<void>;
        copyAudio(srcPath: string, destFolder: string): Promise<string>;
        openFolder(folderPath: string): Promise<void>;
        delete(folderPath: string): Promise<void>;
      };
      audio: {
        getPath(folderPath: string, audioFile: string): Promise<string>;
        readFile(absolutePath: string): Promise<Uint8Array<ArrayBuffer>>;
      };
      dialog: {
        openAudioFile(): Promise<string | null>;
        openChartFolder(): Promise<string | null>;
      };
      charts: {
        getDir(): Promise<string>;
      };
      file: {
        saveBase64(folderPath: string, fileName: string, base64: string): Promise<void>;
      };
    };
  }
}
