export class AudioEngine {
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private sourceNode: AudioBufferSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private _startedAt = 0;
  private _pausedAt = 0;
  private _endedAt: number | null = null; // 自然終了時の再生位置
  private _isPlaying = false;
  private _volume = 1.0;

  onEnded: (() => void) | null = null;

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = this._volume;
      this.gainNode.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  async loadFromPath(absolutePath: string): Promise<void> {
    const ctx = this.getCtx();
    // IPC 経由でメインプロセスに読ませる（renderer から file:// を fetch すると CORS でブロックされる）
    const uint8 = await window.electronAPI.audio.readFile(absolutePath);
    // IPC 転送後の Uint8Array は SharedArrayBuffer を返す可能性があるため必ず ArrayBuffer にコピーする
    const arrayBuf = uint8.buffer.slice(uint8.byteOffset, uint8.byteOffset + uint8.byteLength) as ArrayBuffer;
    this.buffer = await ctx.decodeAudioData(arrayBuf);
    this._pausedAt = 0;
    this._isPlaying = false;
  }

  // 音楽ファイルなしで動作するメトロノームビート生成（デモ用）
  generateMetronomeBeat(durationSec: number, bpm: number): void {
    const ctx = this.getCtx();
    const sampleRate = ctx.sampleRate;
    const totalSamples = Math.ceil(durationSec * sampleRate);
    const buf = ctx.createBuffer(1, totalSamples, sampleRate);
    const data = buf.getChannelData(0);

    const beatInterval = 60 / bpm;
    const clickDuration = 0.02;
    const clickSamples = Math.floor(clickDuration * sampleRate);

    let beatTime = 0;
    while (beatTime < durationSec) {
      const startSample = Math.floor(beatTime * sampleRate);
      for (let i = 0; i < clickSamples && startSample + i < totalSamples; i++) {
        // 440Hz サイン波クリック
        const freq = 880;
        const t = i / sampleRate;
        const env = 1 - i / clickSamples;
        data[startSample + i] = Math.sin(2 * Math.PI * freq * t) * env * 0.4;
      }
      beatTime += beatInterval;
    }

    this.buffer = buf;
    this._pausedAt = 0;
    this._isPlaying = false;
  }

  async resume(): Promise<void> {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  play(offsetSec = 0): void {
    if (!this.buffer) return;
    const ctx = this.getCtx();
    this.stop();

    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.connect(this.gainNode!);
    src.onended = () => {
      if (this._isPlaying) {
        this._endedAt = this.ctx ? this.ctx.currentTime - this._startedAt : 0;
        this._isPlaying = false;
        this.onEnded?.();
      }
    };

    const startOffset = Math.max(0, offsetSec);
    src.start(0, startOffset);
    this._startedAt = ctx.currentTime - startOffset;
    this._pausedAt = 0;
    this._endedAt = null;
    this._isPlaying = true;
    this.sourceNode = src;
  }

  pause(): void {
    if (!this._isPlaying) return;
    this._pausedAt = this.currentTime;
    this.sourceNode?.stop();
    this.sourceNode = null;
    this._isPlaying = false;
  }

  resume_playback(): void {
    if (this._isPlaying) return;
    this.play(this._pausedAt);
  }

  stop(): void {
    if (this.sourceNode) {
      try { this.sourceNode.stop(); } catch { /* already stopped */ }
      this.sourceNode = null;
    }
    this._isPlaying = false;
    this._pausedAt = 0;
  }

  get currentTime(): number {
    if (!this.ctx) return 0;
    if (this._isPlaying) return this.ctx.currentTime - this._startedAt;
    if (this._endedAt !== null) return this._endedAt; // 自然終了後は終了時刻を返す
    return this._pausedAt;
  }

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get duration(): number {
    return this.buffer?.duration ?? 0;
  }

  set volume(v: number) {
    this._volume = v;
    if (this.gainNode) this.gainNode.gain.value = v;
  }

  destroy(): void {
    this.stop();
    this.ctx?.close();
    this.ctx = null;
    this.buffer = null;
    this.gainNode = null;
  }
}
