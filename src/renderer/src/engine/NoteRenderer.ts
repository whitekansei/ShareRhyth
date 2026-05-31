import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { Note, Lane } from '../types/chart';
import { LANE_KEYS, LANE_COUNT, LANES } from '../constants/lanes';

const LANE_COLORS: Record<Lane, number> = {
  S: 0x4fc3f7,
  D: 0x81c784,
  F: 0xffb74d,
  J: 0xffb74d,
  K: 0x81c784,
  L: 0x4fc3f7
};

const JUDGE_LINE_RATIO = 0.85;

interface ActiveNote {
  note: Note;
  gfx: Graphics;
}

interface HitEffect {
  gfx: Graphics;
  lane: number;
  frames: number;
}

interface LongNoteBar {
  startNoteId: string;
  endNoteId: string;
  startNoteTime: number;
  endNoteTime: number;
  startLane: number;
  endLane: number;
  gfx: Graphics;
  color: number;
}

export class NoteRenderer {
  private app: Application;
  private laneContainer!: Container;
  private longNoteContainer!: Container;
  private noteContainer!: Container;
  private effectContainer!: Container;
  private judgeLineY = 0;
  private laneWidth = 0;
  private laneOffsetX = 0;
  private activeNotes: ActiveNote[] = [];
  private hitEffects: HitEffect[] = [];
  private laneFlashes: Array<{ gfx: Graphics; frames: number }> = [];
  private longNoteBars: LongNoteBar[] = [];
  private _ready = false;
  private _destroyed = false;
  public readyPromise: Promise<void>;

  constructor(canvas: HTMLCanvasElement) {
    this.app = new Application();
    this.readyPromise = this.app
      .init({
        canvas,
        width: canvas.clientWidth || 1280,
        height: canvas.clientHeight || 720,
        backgroundColor: 0x0a0a0f,
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        preference: 'canvas'
      })
      .then(() => {
        if (this._destroyed) {
          this.app.destroy(false, { children: true });
          return;
        }
        this.setup();
        this._ready = true;
      });
  }

  get isReady(): boolean { return this._ready; }

  private setup(): void {
    const { screen } = this.app;
    this.judgeLineY = screen.height * JUDGE_LINE_RATIO;

    const TOTAL_LANE_W = screen.width * 0.55;
    this.laneWidth = TOTAL_LANE_W / LANE_COUNT;
    this.laneOffsetX = (screen.width - TOTAL_LANE_W) / 2;

    this.laneContainer = new Container();
    this.longNoteContainer = new Container();
    this.noteContainer = new Container();
    this.effectContainer = new Container();

    // z-order: lanes → long note bars → notes → effects
    this.app.stage.addChild(this.laneContainer);
    this.app.stage.addChild(this.longNoteContainer);
    this.app.stage.addChild(this.noteContainer);
    this.app.stage.addChild(this.effectContainer);

    this.drawLanes();
    this.drawKeyLabels();
  }

  private drawLanes(): void {
    const { screen } = this.app;
    const bg = new Graphics();
    bg.rect(this.laneOffsetX, 0, this.laneWidth * LANE_COUNT, screen.height);
    bg.fill({ color: 0x111118 });
    this.laneContainer.addChild(bg);

    for (let i = 0; i <= LANE_COUNT; i++) {
      const x = this.laneOffsetX + i * this.laneWidth;
      const line = new Graphics();
      line.moveTo(x, 0).lineTo(x, screen.height);
      line.stroke({ color: 0x333355, width: 1 });
      this.laneContainer.addChild(line);
    }

    const judgeLine = new Graphics();
    judgeLine.rect(this.laneOffsetX, this.judgeLineY - 3, this.laneWidth * LANE_COUNT, 6);
    judgeLine.fill({ color: 0xffffff });
    this.laneContainer.addChild(judgeLine);

    const glowLine = new Graphics();
    glowLine.rect(this.laneOffsetX, this.judgeLineY - 8, this.laneWidth * LANE_COUNT, 16);
    glowLine.fill({ color: 0x6666ff, alpha: 0.3 });
    this.laneContainer.addChild(glowLine);
  }

  private drawKeyLabels(): void {
    LANES.forEach((lane, i) => {
      const x = this.laneOffsetX + (i + 0.5) * this.laneWidth;
      const style = new TextStyle({
        fontFamily: 'Arial',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xaaaacc
      });
      const label = new Text({ text: lane, style });
      label.anchor.set(0.5);
      label.x = x;
      label.y = this.judgeLineY + 28;
      this.laneContainer.addChild(label);
    });
  }

  // ノーツを全件まとめてロード（ロングノーツバーも自動設定）
  loadNotes(notes: Note[]): void {
    if (!this._ready || !this.app.stage) return;

    for (const note of notes) {
      this.addNote(note);
    }

    const noteMap = new Map(notes.map(n => [n.id, n]));
    for (const note of notes) {
      if (!note.longNoteEndId) continue;
      const endNote = noteMap.get(note.longNoteEndId);
      if (!endNote) continue;

      const gfx = new Graphics();
      this.longNoteContainer.addChild(gfx);
      this.longNoteBars.push({
        startNoteId: note.id,
        endNoteId: note.longNoteEndId,
        startNoteTime: note.time,
        endNoteTime: endNote.time,
        startLane: LANE_KEYS[note.lane],
        endLane: LANE_KEYS[endNote.lane],
        gfx,
        color: LANE_COLORS[note.lane]
      });
    }
  }

  addNote(note: Note): void {
    if (!this._ready || !this.app.stage) return;
    const color = LANE_COLORS[note.lane];
    if (color === undefined) return;
    const laneIdx = LANE_KEYS[note.lane];
    const x = this.laneOffsetX + (laneIdx + 0.5) * this.laneWidth;

    const gfx = new Graphics();
    gfx.roundRect(-this.laneWidth * 0.38, -10, this.laneWidth * 0.76, 20, 6);
    gfx.fill({ color });
    gfx.roundRect(-this.laneWidth * 0.38, -10, this.laneWidth * 0.76, 20, 6);
    gfx.stroke({ color: 0xffffff, width: 2, alpha: 0.6 });
    gfx.x = x;
    gfx.y = -50;

    this.noteContainer.addChild(gfx);
    this.activeNotes.push({ note, gfx });
  }

  updateNotes(currentTime: number, speed: number): void {
    if (!this._ready) return;

    // ── ロングノーツバー更新 ──
    for (const bar of this.longNoteBars) {
      const sx = this.laneOffsetX + (bar.startLane + 0.5) * this.laneWidth;
      const ex = this.laneOffsetX + (bar.endLane + 0.5) * this.laneWidth;
      const hw = this.laneWidth * 0.38;
      // startNoteTime < endNoteTime なので sy > ey（始点が画面下側）
      const sy = this.judgeLineY - (bar.startNoteTime - currentTime) * speed;
      const ey = this.judgeLineY - (bar.endNoteTime - currentTime) * speed;

      bar.gfx.clear();

      // 終点が判定ラインを過ぎたら描画不要
      if (ey >= this.judgeLineY) continue;

      // 判定ラインでクリップした4頂点を求める
      // 同レーン → 長方形、異レーン → 平行四辺形
      let x0: number, y0: number, x1: number, y1: number; // 下辺（始点側）左・右
      if (sy <= this.judgeLineY) {
        // 始点がまだ判定ラインより上 → クリップ不要
        x0 = sx - hw;  y0 = sy;
        x1 = sx + hw;  y1 = sy;
      } else {
        // 始点が判定ラインを通過 → 判定ライン上の交点に切り詰める
        const t = (sy - this.judgeLineY) / (sy - ey); // 0=始点側, 1=終点側
        x0 = (sx - hw) + t * (ex - sx);  y0 = this.judgeLineY;
        x1 = (sx + hw) + t * (ex - sx);  y1 = this.judgeLineY;
      }

      // 上辺（終点側）
      const x2 = ex + hw,  y2 = ey;
      const x3 = ex - hw,  y3 = ey;

      bar.gfx
        .moveTo(x0, y0)
        .lineTo(x1, y1)
        .lineTo(x2, y2)
        .lineTo(x3, y3)
        .closePath();
      bar.gfx.fill({ color: bar.color, alpha: 0.4 });
    }

    // ── ノーツ位置更新 ──
    const offScreenIds: string[] = [];
    for (const an of this.activeNotes) {
      const y = this.judgeLineY - (an.note.time - currentTime) * speed;
      an.gfx.y = y;
      if (y > this.app.screen.height + 60) offScreenIds.push(an.note.id);
    }
    for (const id of offScreenIds) this.removeNote(id);

    // ── ヒットエフェクト更新 ──
    for (const ef of [...this.hitEffects]) {
      ef.frames--;
      ef.gfx.alpha = ef.frames / 20;
      if (ef.frames <= 0) {
        ef.gfx.destroy();
        this.hitEffects = this.hitEffects.filter((e) => e !== ef);
      }
    }

    for (const fl of [...this.laneFlashes]) {
      fl.frames--;
      fl.gfx.alpha = fl.frames / 8;
      if (fl.frames <= 0) {
        fl.gfx.destroy();
        this.laneFlashes = this.laneFlashes.filter((f) => f !== fl);
      }
    }
  }

  removeNote(noteId: string): void {
    const idx = this.activeNotes.findIndex((a) => a.note.id === noteId);
    if (idx !== -1) {
      this.activeNotes[idx].gfx.destroy();
      this.activeNotes.splice(idx, 1);
    }

    // 終点ノーツが消えたらバーも削除
    const barIdx = this.longNoteBars.findIndex(b => b.endNoteId === noteId);
    if (barIdx !== -1) {
      this.longNoteBars[barIdx].gfx.destroy();
      this.longNoteBars.splice(barIdx, 1);
    }
  }

  showHitEffect(lane: Lane, color: number): void {
    const laneIdx = LANE_KEYS[lane];
    const x = this.laneOffsetX + (laneIdx + 0.5) * this.laneWidth;

    const gfx = new Graphics();
    gfx.circle(0, 0, this.laneWidth * 0.45);
    gfx.fill({ color, alpha: 0.85 });
    gfx.x = x;
    gfx.y = this.judgeLineY;
    this.effectContainer.addChild(gfx);
    this.hitEffects.push({ gfx, lane: laneIdx, frames: 20 });

    const flash = new Graphics();
    flash.rect(this.laneOffsetX + laneIdx * this.laneWidth, 0, this.laneWidth, this.judgeLineY);
    flash.fill({ color, alpha: 0.12 });
    this.effectContainer.addChild(flash);
    this.laneFlashes.push({ gfx: flash, frames: 8 });
  }

  resize(width: number, height: number): void {
    this.app.renderer.resize(width, height);
    this.laneContainer.removeChildren();
    this.judgeLineY = height * JUDGE_LINE_RATIO;
    const TOTAL_LANE_W = width * 0.55;
    this.laneWidth = TOTAL_LANE_W / LANE_COUNT;
    this.laneOffsetX = (width - TOTAL_LANE_W) / 2;
    this.drawLanes();
    this.drawKeyLabels();
  }

  destroy(): void {
    this._destroyed = true;
    if (!this._ready) return;
    this.app.destroy(false, { children: true });
  }
}
