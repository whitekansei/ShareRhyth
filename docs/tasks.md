# ShareRyth 実装タスク

## フェーズ概要

| フェーズ | 内容 | 目標 |
|---------|------|------|
| 0 | プロジェクト初期化 | ビルドが通る空のアプリ |
| 1 | コア型・定数定義 | 全モジュールが共有する型の確立 |
| 2 | Electron 基盤 | IPC・ファイルI/O・ウィンドウ管理 |
| 3 | オーディオエンジン | 精度の高い楽曲再生・タイミング基盤 |
| 4 | 描画エンジン | PixiJS でのノーツ・レーン描画 |
| 5 | 判定エンジン | PERFECT/GREAT/GOOD/MISS 判定 |
| 6 | ゲームプレイ画面 | プレイアブルな状態 |
| 7 | 曲選択画面 | 曲一覧・ファイル読み込み |
| 8 | 譜面エディタ | 譜面作成・編集・保存 |
| 9 | 結果画面 | スコア・判定統計の表示 |
| 10 | 共有機能 (Supabase) | 譜面アップロード・ダウンロード |
| 11 | 仕上げ | UI/UX ポリッシュ・パフォーマンスチューニング |

---

## フェーズ 0 — プロジェクト初期化

- [ ] `electron-vite` でプロジェクトスキャフォールド (`npm create @quick-start/electron`)
- [ ] TypeScript・React テンプレートを選択
- [ ] 依存パッケージを追加インストール
  - [ ] `pixi.js` (^8)
  - [ ] `react-router-dom` (v6)
  - [ ] `electron-store`
  - [ ] `@supabase/supabase-js`
- [ ] `eslint` + `@typescript-eslint` 設定を追加
- [ ] `tsconfig` の `strict: true` を確認
- [ ] `npm run dev` でウィンドウが開くことを確認

---

## フェーズ 1 — コア型・定数定義

### `src/renderer/types/chart.ts`
- [ ] `Lane` 型 (`"S" | "D" | "F" | "J" | "K" | "L"`)
- [ ] `Note` 型 (`{ id: string; time: number; lane: Lane }`)
- [ ] `Chart` 型 (version, title, artist, bpm, audioFile, offset, notes[])
- [ ] `ChartMeta` 型（曲選択画面用の軽量メタデータ）

### `src/renderer/types/judgement.ts`
- [ ] `JudgementResult` 型 (`"PERFECT" | "GREAT" | "GOOD" | "MISS"`)
- [ ] `HitResult` 型 (`{ noteId: string; result: JudgementResult; delta: number }`)

### `src/renderer/constants/lanes.ts`
- [ ] `LANE_KEYS` マップ (`{ S: 0, D: 1, F: 2, J: 3, K: 4, L: 5 }`)
- [ ] `KEY_TO_LANE` 逆引きマップ

### `src/renderer/constants/judgement.ts`
- [ ] `JUDGEMENT_WINDOWS` (`PERFECT: 40, GREAT: 80, GOOD: 120`) (ミリ秒)

---

## フェーズ 2 — Electron 基盤

### `src/main/index.ts`
- [ ] `BrowserWindow` 作成（1280×720、resizable）
- [ ] `preload` スクリプトのパス設定
- [ ] 開発時のみ DevTools を自動オープン

### `src/preload/index.ts`
- [ ] `contextBridge.exposeInMainWorld('electronAPI', {...})` の雛形

### `src/main/ipc/` — IPC ハンドラ
- [ ] `chart:load` — 指定パスの `chart.json` を読んで返す
- [ ] `chart:save` — `Chart` オブジェクトを JSON で保存
- [ ] `chart:list` — `charts/` ディレクトリ内の全 `ChartMeta` を返す
- [ ] `audio:getPath` — 曲フォルダ内の音楽ファイルパスを絶対パスで返す
- [ ] `dialog:openAudioFile` — ファイル選択ダイアログを開き MP3/WAV パスを返す
- [ ] `dialog:openChartFolder` — フォルダ選択ダイアログ（エクスポート用）

### `src/preload/index.ts` — API 露出
- [ ] 上記 IPC ハンドラをすべて `window.electronAPI` 経由で呼び出せるようにする

### `src/renderer/types/electron.d.ts`
- [ ] `window.electronAPI` の型定義

---

## フェーズ 3 — オーディオエンジン

### `src/renderer/engine/AudioEngine.ts`
- [ ] `AudioContext` の初期化（ユーザジェスチャー後に resume）
- [ ] `loadAudio(filePath: string): Promise<void>` — IPC 経由でパス取得 → `fetch` → `decodeAudioData`
- [ ] `play(startOffset?: number): void` — `AudioBufferSourceNode` を生成して再生
- [ ] `pause(): void` / `resume(): void`
- [ ] `stop(): void`
- [ ] `get currentTime(): number` — `AudioContext.currentTime - startedAt + offset` を返す
- [ ] `get isPlaying(): boolean`
- [ ] イベントリスナ: `onEnded`

---

## フェーズ 4 — 描画エンジン

### `src/renderer/engine/NoteRenderer.ts`
- [ ] `PixiJS Application` の初期化・Canvas マウント
- [ ] `LANE_COUNT = 6`・レーン幅・レーンY座標の定数化
- [ ] レーン背景・区切り線の描画
- [ ] 判定ライン（画面下部）の描画
- [ ] `addNote(note: Note): void` — `Graphics` オブジェクト生成・プール管理
- [ ] `updateNotes(currentTime: number, speed: number): void` — Y座標更新
  - `y = JUDGE_LINE_Y - (note.time - currentTime) * speed`
- [ ] 画面外に出たノーツの自動 destroy
- [ ] 判定エフェクト（ヒット時の光るエフェクト）
- [ ] `destroy(): void` — アンマウント時のクリーンアップ

---

## フェーズ 5 — 判定エンジン

### `src/renderer/engine/JudgementEngine.ts`
- [ ] `loadChart(chart: Chart): void` — ノーツをタイムライン順に並べキューに積む
- [ ] `processKeyDown(lane: Lane, currentTime: number): HitResult | null`
  - 対象レーンの最近傍ノーツを探す
  - delta (ms) を計算し `JUDGEMENT_WINDOWS` と比較
  - ヒット結果を返す（MISS 未満ならそのノーツをキューから除去）
- [ ] `processMiss(currentTime: number): Note[]` — 判定窓を超えたノーツを MISS として返す
- [ ] `reset(): void`

---

## フェーズ 6 — ゲームプレイ画面

### `src/renderer/screens/Gameplay/`

#### `GameplayScreen.tsx`
- [ ] `useRef` で `AudioEngine`・`NoteRenderer`・`JudgementEngine` を保持
- [ ] `useEffect` でエンジン初期化・アンマウント時 destroy
- [ ] ゲームループ (`requestAnimationFrame`)
  - `NoteRenderer.updateNotes(audioEngine.currentTime, speed)` を毎フレーム呼ぶ
  - `JudgementEngine.processMiss()` で見逃しを検出
- [ ] `keydown` イベントでキー入力 → `JudgementEngine.processKeyDown()` → 結果をUIに反映
- [ ] カウントダウン演出（3・2・1・GO!）
- [ ] ポーズ機能（Escape キー）
- [ ] 曲終了後に結果画面へ遷移

#### `ScoreDisplay.tsx`
- [ ] コンボ数表示（中央上部）
- [ ] 判定テキスト表示（PERFECT/GREAT/GOOD/MISS アニメーション）
- [ ] スコア表示（右上）

#### `PauseOverlay.tsx`
- [ ] 半透明オーバーレイ
- [ ] Resume / Retry / Quit ボタン

#### ゲームロジック（hook）`useGameplay.ts`
- [ ] スコア計算ロジック (PERFECT: 1000, GREAT: 700, GOOD: 400, MISS: 0) × combo bonus
- [ ] コンボ管理（MISS でリセット）
- [ ] 判定カウント集計（結果画面渡し用）

---

## フェーズ 7 — 曲選択画面

### `src/renderer/screens/SongSelect/`

#### `SongSelectScreen.tsx`
- [ ] 起動時に `window.electronAPI.chart.list()` で曲一覧取得
- [ ] 曲カードリスト表示（タイトル・アーティスト・BPM）
- [ ] 曲カードクリックで選択状態に
- [ ] 選択中の曲のプレビュー（アルバムアート or プレースホルダー）
- [ ] 「プレイ」ボタン → Gameplay 画面へ遷移（`state` で Chart を渡す）
- [ ] 「エディタ」ボタン → Editor 画面へ遷移
- [ ] 外部フォルダから譜面追加ボタン（`dialog:openChartFolder`）

---

## フェーズ 8 — 譜面エディタ

### `src/renderer/screens/Editor/`

#### 全体構成
- [ ] 左パネル: 楽曲情報（タイトル・アーティスト・BPM・offset 入力）
- [ ] 中央: タイムライン（PixiJS Canvas）
- [ ] 右パネル: ツール選択・スナップ設定・タップテンポ

#### `EditorTimeline.tsx` (PixiJS Canvas)
- [ ] 縦スクロールタイムライン（時間軸：下が現在・上が未来）
- [ ] ビート線描画（`beatToTime()` で位置計算）
- [ ] スナップグリッド (1/4・1/8・1/12・1/16 拍)
- [ ] ノーツ描画（配置済みノーツを `chart.notes` から描画）
- [ ] クリックでノーツ配置（スナップ位置に丸める）
- [ ] 右クリックでノーツ削除
- [ ] 再生ヘッド（現在時刻を示す横線）の描画
- [ ] タイムラインのドラッグスクロール

#### `TapTempoButton.tsx`
- [ ] タップするたびにタイムスタンプを記録
- [ ] 直近 4〜8 タップの間隔平均から BPM を計算・フィールドに反映

#### `useEditor.ts` (エディタ状態管理)
- [ ] `chart` state（編集中の Chart オブジェクト）
- [ ] `addNote(time: number, lane: Lane): void`
- [ ] `removeNote(id: string): void`
- [ ] `updateMeta(fields: Partial<Chart>): void`
- [ ] `undo / redo` スタック (Ctrl+Z / Ctrl+Y)
- [ ] 保存 (`chart:save` IPC 呼び出し)

#### エディタでの音楽再生
- [ ] `AudioEngine` を Editor でも使用
- [ ] スペースキーで再生/停止
- [ ] 再生中は再生ヘッドがスクロール
- [ ] クリックでシーク

---

## フェーズ 9 — 結果画面

### `src/renderer/screens/Result/ResultScreen.tsx`
- [ ] スコア（数値 + ランク A/B/C/D/S）
- [ ] 判定内訳（PERFECT/GREAT/GOOD/MISS の個数）
- [ ] 最大コンボ
- [ ] フルコンボ達成時の演出
- [ ] リトライ / 曲選択に戻る ボタン

---

## フェーズ 10 — 共有機能 (Supabase)

### Supabase セットアップ
- [ ] `src/renderer/lib/supabase.ts` — クライアント初期化（`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`）
- [ ] Supabase テーブル設計
  - `charts` テーブル: `id, title, artist, bpm, uploader, created_at, json_url, downloads`
  - Storage バケット `chart-files` に `chart.json` + `audio` を格納

### アップロード (`src/renderer/lib/chartShare.ts`)
- [ ] `uploadChart(chart: Chart, audioFile: File): Promise<string>` — Storage に upload → `charts` テーブルに insert → 共有 URL を返す

### ダウンロード
- [ ] `fetchChartList(): Promise<ChartMeta[]>` — Supabase から曲一覧取得
- [ ] `downloadChart(id: string): Promise<void>` — JSON + 音楽ファイルをローカルの `charts/` に保存（IPC 経由）

### UI
- [ ] 曲選択画面に「オンライン譜面」タブ追加
- [ ] アップロードボタン（エディタ画面）

---

## フェーズ 11 — 仕上げ

### パフォーマンス
- [ ] ノーツ `Graphics` オブジェクトのオブジェクトプール実装
- [ ] タイムラインに表示するノーツの範囲を `currentTime ± 表示秒数` に限定

### UI/UX
- [ ] アプリ全体のカラーテーマ設定（CSS 変数）
- [ ] ウィンドウリサイズ時の PixiJS Canvas リサイズ対応
- [ ] 設定画面（音量・ノーツスピード・オフセット補正）— `electron-store`

### テスト・品質
- [ ] `JudgementEngine` のユニットテスト
- [ ] `AudioEngine.currentTime` の精度検証
- [ ] `npm run typecheck` がエラー 0 で通ること
- [ ] `npm run lint` がエラー 0 で通ること

---

## 実装順序（推奨）

```
フェーズ 0 → 1 → 2 → 3 → 4 → 5 → 6（最小プレイアブル）
→ 7 → 8 → 9（完全なゲームフロー）
→ 10（共有機能）
→ 11（仕上げ）
```

最初のマイルストーン（フェーズ 0〜6）完了時点で、ハードコードされた 1 曲を実際にプレイできる状態になる。
