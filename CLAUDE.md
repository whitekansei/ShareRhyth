# Rhythm Game Project

## Project Overview
6レーンのキーボードリズムゲーム。画面上部から降ってくるノーツをタイミングよくキー入力して遊ぶ。タイトルは「ShareRhyth」。
譜面エディタ機能を内蔵し、ユーザが自分で譜面を作成・共有できる。

## Tech Stack
- **Runtime**: Electron (デスクトップアプリ化・ローカルファイルアクセス)
- **Language**: TypeScript
- **UI Framework**: React
- **Rendering**: PixiJS (ノーツアニメーション・Canvas描画)
- **Audio**: Web Audio API (高精度タイミング制御)
- **Persistence**: electron-store (設定・譜面メタデータ管理)
- **Build**: electron-vite
- **Package Manager**: npm

## Project Structure
```
rhythm-game/
├── CLAUDE.md
├── docs/                        # 詳細仕様・実装メモ（@docs/xxx.mdで参照）
│   ├── architecture.md
│   ├── chart-format.md          # 譜面JSONフォーマット仕様
│   └── tasks.md                 # [ ]チェックボックスで進捗管理
├── src/
│   ├── main/                    # Electronメインプロセス
│   │   ├── index.ts
│   │   └── ipc/                 # IPC handlers（ファイルI/O等）
│   ├── preload/                 # コンテキストブリッジ
│   │   └── index.ts
│   └── renderer/                # Reactフロントエンド
│       ├── main.tsx
│       ├── App.tsx
│       ├── screens/
│       │   ├── SongSelect/      # 曲選択画面
│       │   ├── Gameplay/        # ゲームプレイ画面
│       │   └── Editor/          # 譜面エディタ画面
│       ├── components/          # 共通コンポーネント
│       ├── hooks/               # カスタムフック
│       ├── engine/              # ゲームロジック
│       │   ├── AudioEngine.ts   # Web Audio API管理
│       │   ├── NoteRenderer.ts  # PixiJS描画
│       │   └── JudgementEngine.ts # 判定ロジック
│       └── types/               # 型定義
│           └── chart.ts         # 譜面型定義
└── charts/                      # 譜面フォルダ置き場（各サブフォルダが1曲）
    └── example-song/
        ├── chart.json
        └── audio.mp3
```

## Chart Format (譜面JSONフォーマット)
```json
{
  "version": 1,
  "title": "曲名",
  "artist": "アーティスト名",
  "bpm": 140,
  "audioFile": "audio.mp3",
  "offset": 0.0,
  "notes": [
    { "time": 1.234, "lane": "S" },
    { "time": 1.500, "lane": "D" }
  ]
}
```
- `time`: 秒単位の絶対時間（AudioContext.currentTime基準）
- `lane`: `"S" | "D" | "F" | "J" | "K" | "L"` の6種
- `bpm`: ユーザが譜面作成時に手動入力する。自動取得は行わない
- `offset`: 楽曲の先頭から1拍目までの時間（秒）。エディタで微調整する

## BPM / Offset の扱い（エディタ）

### 基本方針
- BPMはユーザが手動入力する（楽曲ファイルからの自動検出は行わない）
- タップテンポ機能で補助する（曲に合わせてキー入力 → BPMを自動計算）
- `offset` でタイムラインの基点（1拍目の位置）を秒単位で微調整する

### タップテンポの計算
```ts
// タップのたびにタイムスタンプを記録し、間隔の平均からBPMを算出
const bpm = 60 / avgIntervalSec;
// 直近4〜8タップの平均を使う（最初の1タップは無視）
```

### 拍↔時刻の変換（エディタ・ゲームプレイ共通）
```ts
const beatDuration = 60 / bpm; // 1拍の長さ（秒）

// 時刻（秒） → 拍番号（0始まり）
const timeToBeat = (time: number) => (time - offset) / beatDuration;

// 拍番号 → 時刻（秒）
const beatToTime = (beat: number) => beat * beatDuration + offset;
```

### エディタのタイムライングリッド
- ビート線はすべて `beatToTime()` で計算した位置に描画する
- スナップは選択中の分割数（1/4・1/8・1/12・1/16拍）に応じて `beatDuration / division` 単位に丸める
- ノーツの `time` はスナップ後の `beatToTime()` 結果をそのまま保存する（拍番号では保存しない）

## Key Bindings (固定)
| キー | レーン |
|------|--------|
| S    | 1      |
| D    | 2      |
| F    | 3      |
| J    | 4      |
| K    | 5      |
| L    | 6      |

## Judgement Timing Windows
| 判定   | 時間窓       |
|--------|-------------|
| PERFECT | ±40ms      |
| GREAT   | ±80ms      |
| GOOD    | ±120ms     |
| MISS    | それ以外    |

## Core Architecture Rules

### Audio Timing (最重要)
- ノーツの位置計算は必ず `AudioContext.currentTime` を基準にする
- `requestAnimationFrame` のタイムスタンプではなく AudioContext の時間軸を使う
- ノーツの描画Y座標 = `(note.time - audioCtx.currentTime) * speed`

### Electron IPC
- メインプロセス⇔レンダラー間の通信はすべてIPC経由（contextBridge）
- ファイルI/O（譜面読み込み・保存・音楽ファイル選択）はメインプロセスで行う
- `fs` や `path` をレンダラーから直接使わない

### React / State
- ゲームループ（requestAnimationFrame）の状態はReact stateで管理しない
- PixiJSのアプリケーションインスタンスはuseRefで保持する
- 画面遷移はReact Router v6を使用

## Commands
```bash
npm run dev          # 開発サーバー起動（Electron + Vite HMR）
npm run build        # プロダクションビルド
npm run typecheck    # TypeScript型チェック
npm run lint         # ESLintチェック
```

## Code Style
- インデント: スペース2つ
- セミコロン: あり
- 関数コンポーネントのみ使用（クラスコンポーネント禁止）
- `any` 型の使用禁止（必ず適切な型を定義する）
- PixiJSオブジェクトはコンポーネントのアンマウント時に必ず `destroy()` する

## Do NOT
- レンダラープロセスから `fs`/`path` を直接インポートしない
- `requestAnimationFrame` のtimestampをノーツ判定タイミングの基準にしない
- React stateをゲームループ内で `setState` する（パフォーマンス劣化）
- 譜面の `time` をミリ秒で保存する（秒統一）
