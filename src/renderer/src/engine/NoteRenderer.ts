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
const VANISH_Y_RATIO = 0.20;   // 消失点の位置（画面上部20%）
const PREVIEW_FADE_BEATS = 1.5; // クロスレーンプレビューのフェードイン開始（拍数）

interface ActiveNote {
  note: Note;
  gfx: Graphics;
  color: number;
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
  previewGfx: Graphics | null; // クロスレーン時のみ存在
  color: number;     // 始点レーンの色（バー描画用）
  endColor: number;  // 終点レーンの色（プレビュー描画用）
}

export class NoteRenderer {
  private app: Application;
  private laneContainer!: Container;
  private longNoteContainer!: Container;
  private syncLineGfx!: Graphics;
  private noteContainer!: Container;
  private previewContainer!: Container;
  private effectContainer!: Container;
  private judgeLineY = 0;
  private vanishY = 0;
  private vanishX = 0;
  private fieldHeight = 0;
  private laneWidth = 0;
  private laneOffsetX = 0;
  private beatDuration = 0.5; // デフォルト120BPM
  private activeNotes: ActiveNote[] = [];
  private hitEffects: HitEffect[] = [];
  private laneFlashes: Array<{ gfx: Graphics; frames: number }> = [];
  private longNoteBars: LongNoteBar[] = [];
  private simultaneousGroups: Array<Set<string>> = [];
  private showSyncLine = true;
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
        antialias: true,
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
    this.vanishX = this.laneOffsetX + (LANE_COUNT / 2) * this.laneWidth;
    this.vanishY = screen.height * VANISH_Y_RATIO;
    this.fieldHeight = this.judgeLineY - this.vanishY;

    this.laneContainer = new Container();
    this.longNoteContainer = new Container();
    this.syncLineGfx = new Graphics();
    this.noteContainer = new Container();
    this.previewContainer = new Container();
    this.effectContainer = new Container();

    // z-order: lanes → longNotes → syncLines → notes → previews → effects
    this.app.stage.addChild(this.laneContainer);
    this.app.stage.addChild(this.longNoteContainer);
    this.app.stage.addChild(this.syncLineGfx);
    this.app.stage.addChild(this.noteContainer);
    this.app.stage.addChild(this.previewContainer);
    this.app.stage.addChild(this.effectContainer);

    this.drawLanes();
    this.drawKeyLabels();
  }

  // 透視投影ヘルパー
  // lanePos: レーン単位の横位置（例: laneIdx + 0.5 でレーン中央）
  // dt: 判定バーに到達するまでの秒数（正=未来、負=通過済み）
  // 戻り値 scale=1 が判定バー上、scale→0 が消失点方向
  private perspProject(
    dt: number,
    lanePos: number,
    speed: number
  ): { x: number; y: number; scale: number } {
    const linearDepth = dt * speed / this.fieldHeight;
    // linearDepth が -1 に近づくと scale が発散するので下限ガード
    const scale = linearDepth < -0.95 ? 20 : 1 / (1 + linearDepth);
    const xBottom = this.laneOffsetX + lanePos * this.laneWidth;
    return {
      x: this.vanishX + (xBottom - this.vanishX) * scale,
      y: this.vanishY + this.fieldHeight * scale,
      scale
    };
  }

  private drawLanes(): void {
    const { screen } = this.app;

    // フィールド背景（消失点から判定バーへの三角形）
    const bg = new Graphics();
    bg.moveTo(this.vanishX, this.vanishY)
      .lineTo(this.laneOffsetX, this.judgeLineY)
      .lineTo(this.laneOffsetX + LANE_COUNT * this.laneWidth, this.judgeLineY)
      .closePath();
    bg.fill({ color: 0x111118 });
    this.laneContainer.addChild(bg);

    // 奥行きグリッド線（画面スペースで等間隔）
    const NUM_DEPTH_LINES = 10;
    for (let i = 1; i <= NUM_DEPTH_LINES; i++) {
      const s = i / (NUM_DEPTH_LINES + 1);
      const y = this.vanishY + this.fieldHeight * s;
      const leftX = this.vanishX + (this.laneOffsetX - this.vanishX) * s;
      const rightX = this.vanishX + (this.laneOffsetX + LANE_COUNT * this.laneWidth - this.vanishX) * s;
      const gridLine = new Graphics();
      gridLine.moveTo(leftX, y).lineTo(rightX, y);
      gridLine.stroke({ color: 0x2a2a44, width: 1, alpha: s * 0.9 });
      this.laneContainer.addChild(gridLine);
    }

    // レーン区切り線（消失点から判定バーへ収束）
    for (let i = 0; i <= LANE_COUNT; i++) {
      const xBottom = this.laneOffsetX + i * this.laneWidth;
      const line = new Graphics();
      line.moveTo(this.vanishX, this.vanishY).lineTo(xBottom, this.judgeLineY);
      line.stroke({ color: 0x333355, width: 1 });
      this.laneContainer.addChild(line);
    }

    // 判定バー
    const judgeLine = new Graphics();
    judgeLine.rect(this.laneOffsetX, this.judgeLineY - 3, this.laneWidth * LANE_COUNT, 6);
    judgeLine.fill({ color: 0xffffff });
    this.laneContainer.addChild(judgeLine);

    const glowLine = new Graphics();
    glowLine.rect(this.laneOffsetX, this.judgeLineY - 8, this.laneWidth * LANE_COUNT, 16);
    glowLine.fill({ color: 0x6666ff, alpha: 0.3 });
    this.laneContainer.addChild(glowLine);

    // 判定バー下のエリア
    const belowH = screen.height - this.judgeLineY;
    if (belowH > 0) {
      const below = new Graphics();
      below.rect(this.laneOffsetX, this.judgeLineY, LANE_COUNT * this.laneWidth, belowH);
      below.fill({ color: 0x0d0d1a });
      this.laneContainer.addChild(below);
    }
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

  setShowSyncLine(show: boolean): void {
    this.showSyncLine = show;
  }

  // ノーツを全件まとめてロード（ロングノーツバー・終端プレビューも自動設定）
  loadNotes(notes: Note[], beatDuration?: number): void {
    if (!this._ready || !this.app.stage) return;
    if (beatDuration !== undefined) this.beatDuration = beatDuration;

    for (const note of notes) {
      this.addNote(note);
    }

    // 同時押しグループ検出（同じ time 値を持つノーツ群）
    this.simultaneousGroups = [];
    const timeMap = new Map<number, string[]>();
    for (const note of notes) {
      const bucket = timeMap.get(note.time);
      if (bucket) {
        bucket.push(note.id);
      } else {
        timeMap.set(note.time, [note.id]);
      }
    }
    for (const ids of timeMap.values()) {
      if (ids.length >= 2) {
        this.simultaneousGroups.push(new Set(ids));
      }
    }

    const noteMap = new Map(notes.map(n => [n.id, n]));
    for (const note of notes) {
      if (!note.longNoteEndId) continue;
      const endNote = noteMap.get(note.longNoteEndId);
      if (!endNote) continue;

      const startLaneIdx = LANE_KEYS[note.lane];
      const endLaneIdx = LANE_KEYS[endNote.lane];

      const gfx = new Graphics();
      this.longNoteContainer.addChild(gfx);

      let previewGfx: Graphics | null = null;
      if (startLaneIdx !== endLaneIdx) {
        previewGfx = new Graphics();
        this.previewContainer.addChild(previewGfx);
      }

      this.longNoteBars.push({
        startNoteId: note.id,
        endNoteId: note.longNoteEndId,
        startNoteTime: note.time,
        endNoteTime: endNote.time,
        startLane: startLaneIdx,
        endLane: endLaneIdx,
        gfx,
        previewGfx,
        color: LANE_COLORS[note.lane],
        endColor: LANE_COLORS[endNote.lane]
      });
    }
  }

  addNote(note: Note): void {
    if (!this._ready || !this.app.stage) return;
    const color = LANE_COLORS[note.lane];
    if (color === undefined) return;

    const gfx = new Graphics();
    gfx.visible = false; // updateNotes で透視投影して描画
    this.noteContainer.addChild(gfx);
    this.activeNotes.push({ note, gfx, color });
  }

  updateNotes(currentTime: number, speed: number): void {
    if (!this._ready) return;

    // ── ロングノーツバー（透視投影四辺形）──
    for (const bar of this.longNoteBars) {
      bar.gfx.clear();

      const startDt = bar.startNoteTime - currentTime;
      const endDt = bar.endNoteTime - currentTime;

      if (endDt < 0) continue; // 終点通過済み

      const endProj = this.perspProject(endDt, bar.endLane + 0.5, speed);
      if (endProj.y < this.vanishY - 10) continue; // 消失点より奥

      // 始点は判定バー以下にクリップ（通過後はバーを判定バーに張り付ける）
      const clampedStartDt = Math.max(0, startDt);

      // 四頂点（lane + 0.12 = 左端、lane + 0.88 = 右端）
      const bl = this.perspProject(clampedStartDt, bar.startLane + 0.12, speed);
      const br = this.perspProject(clampedStartDt, bar.startLane + 0.88, speed);
      const tl = this.perspProject(endDt, bar.endLane + 0.12, speed);
      const tr = this.perspProject(endDt, bar.endLane + 0.88, speed);

      bar.gfx
        .moveTo(bl.x, bl.y)
        .lineTo(br.x, br.y)
        .lineTo(tr.x, tr.y)
        .lineTo(tl.x, tl.y)
        .closePath();
      bar.gfx.fill({ color: bar.color, alpha: 0.45 });
      bar.gfx.stroke({ color: bar.color, width: 1, alpha: 0.7 });
    }

    // ── 終端ノーツ予測表示（クロスレーンロングノーツのみ）──
    for (const bar of this.longNoteBars) {
      if (!bar.previewGfx) continue;
      bar.previewGfx.clear();

      const endTimeToBar = bar.endNoteTime - currentTime;
      if (endTimeToBar <= 0) continue;

      const timeToStart = bar.startNoteTime - currentTime;
      const fadeDuration = PREVIEW_FADE_BEATS * this.beatDuration;
      const fadeProgress = Math.min(1, Math.max(0, 1 - timeToStart / fadeDuration));
      if (fadeProgress <= 0) continue;

      const alpha = fadeProgress * 0.65;
      const ex = this.laneOffsetX + (bar.endLane + 0.5) * this.laneWidth;

      // 外側ターゲットリング（プレビューと実ノーツを視覚的に区別）
      bar.previewGfx.roundRect(-this.laneWidth * 0.44, -13, this.laneWidth * 0.88, 26, 9);
      bar.previewGfx.stroke({ color: bar.endColor, width: 2, alpha: fadeProgress * 0.5 });

      // 本体（半透明）
      bar.previewGfx.roundRect(-this.laneWidth * 0.38, -10, this.laneWidth * 0.76, 20, 6);
      bar.previewGfx.fill({ color: bar.endColor, alpha });
      bar.previewGfx.roundRect(-this.laneWidth * 0.38, -10, this.laneWidth * 0.76, 20, 6);
      bar.previewGfx.stroke({ color: 0xffffff, width: 1.5, alpha: alpha * 0.7 });

      bar.previewGfx.x = ex;
      bar.previewGfx.y = this.judgeLineY;
    }

    // ── ノーツ（透視投影・毎フレーム再描画）──
    const offScreenIds: string[] = [];
    const posCache = new Map<string, { x: number; y: number; scale: number }>();
    for (const an of this.activeNotes) {
      const dt = an.note.time - currentTime;
      const laneIdx = LANE_KEYS[an.note.lane];
      const { x, y, scale } = this.perspProject(dt, laneIdx + 0.5, speed);

      if (y > this.app.screen.height + 60) {
        offScreenIds.push(an.note.id);
        continue;
      }
      if (scale < 0.04 || y < this.vanishY - 10) {
        an.gfx.visible = false;
        continue;
      }

      an.gfx.visible = true;
      an.gfx.clear();

      const hw = this.laneWidth * 0.38 * scale;
      const hh = Math.max(3, 9 * scale);
      const r = Math.max(2, 5 * scale);
      const strokeW = Math.max(0.5, 2 * scale);

      an.gfx.roundRect(-hw, -hh, hw * 2, hh * 2, r);
      an.gfx.fill({ color: an.color });
      an.gfx.roundRect(-hw, -hh, hw * 2, hh * 2, r);
      an.gfx.stroke({ color: 0xffffff, width: strokeW, alpha: 0.6 });

      an.gfx.x = x;
      an.gfx.y = y;
      posCache.set(an.note.id, { x, y, scale });
    }
    for (const id of offScreenIds) this.removeNote(id);

    // ── 同時押しライン ──
    this.syncLineGfx.clear();
    if (this.showSyncLine) {
      for (const group of this.simultaneousGroups) {
        const positions: Array<{ x: number; y: number; scale: number }> = [];
        for (const id of group) {
          const pos = posCache.get(id);
          if (pos) positions.push(pos);
        }
        if (positions.length < 2) continue;
        positions.sort((a, b) => a.x - b.x);
        const leftX = positions[0].x;
        const rightX = positions[positions.length - 1].x;
        const y = positions[0].y; // 同 time なので y は全て同じ
        const scale = positions[0].scale;
        this.syncLineGfx
          .moveTo(leftX, y)
          .lineTo(rightX, y);
        this.syncLineGfx.stroke({ color: 0xffffff, width: Math.max(1, 2.5 * scale), alpha: 0.55 });
      }
    }

    // ── ヒットエフェクト ──
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

    // 終点ノーツが消えたらバーと予測表示も削除
    const barIdx = this.longNoteBars.findIndex(b => b.endNoteId === noteId);
    if (barIdx !== -1) {
      this.longNoteBars[barIdx].gfx.destroy();
      this.longNoteBars[barIdx].previewGfx?.destroy();
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

    // レーンフラッシュ（透視形状：判定バーから消失点方向へのくさび形）
    const leftX = this.laneOffsetX + laneIdx * this.laneWidth;
    const rightX = this.laneOffsetX + (laneIdx + 1) * this.laneWidth;
    const flashScale = 0.30;
    const flash = new Graphics();
    flash
      .moveTo(leftX, this.judgeLineY)
      .lineTo(rightX, this.judgeLineY)
      .lineTo(this.vanishX + (rightX - this.vanishX) * flashScale, this.vanishY + this.fieldHeight * flashScale)
      .lineTo(this.vanishX + (leftX - this.vanishX) * flashScale, this.vanishY + this.fieldHeight * flashScale)
      .closePath();
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
    this.vanishX = this.laneOffsetX + (LANE_COUNT / 2) * this.laneWidth;
    this.vanishY = height * VANISH_Y_RATIO;
    this.fieldHeight = this.judgeLineY - this.vanishY;
    this.drawLanes();
    this.drawKeyLabels();
  }

  destroy(): void {
    this._destroyed = true;
    if (!this._ready) return;
    this.app.destroy(false, { children: true });
  }
}
