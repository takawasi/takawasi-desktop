# Takawasi Desktop

takawasi-platform 全機能を1つのデスクトップアプリで。

> The Ultimate Wrapper — all takawasi-platform services, TBA chat, terminal + CLI in one Electron app.

## ダウンロード / Download

**[GitHub Releases](https://github.com/takawasi/takawasi-desktop/releases/latest)**

| OS | ファイル |
|---|---|
| macOS | `Takawasi-Desktop-mac.dmg` (Intel + Apple Silicon) |
| Windows | `Takawasi-Desktop-win.exe` (NSIS installer) |
| Linux | `Takawasi-Desktop-linux.AppImage` |

### 初回起動の注意 / First Launch

**macOS（Gatekeeper 警告）**

```bash
xattr -d com.apple.quarantine /Applications/Takawasi\ Desktop.app
```

「システム設定」→「プライバシーとセキュリティ」→「このまま開く」でも起動可。

**Windows（SmartScreen 警告）**

「詳細情報」→「実行」をクリック。

本アプリはコードサイニング証明書を使用しない OSS 配布です（理由: GitHub OSS 公開、技術慣れたユーザー向け）。

---

## 機能 / Features

- 全サービス分割画面（NovelForge / ArticleForge / BudgetCode / MemForge / LaunchPad）
- TBA 中央チャット（SSE stream + 9段パイプライン進捗表示）
- ターミナル（xterm.js + node-pty、ネイティブシェル）
- 同梱 CLI `takawasi-cli`（ターミナルから即実行可、PATH 自動追加）
- 1回ログイン（CreditGate Cookie を全 WebView・全 API に共有）
- LaunchPad 生成物一覧 + DL ボタン

---

## CLI の使い方 / CLI Usage

アプリ内ターミナルから、または `PATH` に追加してシステムワイドに使用できます。

```bash
# TBA にメッセージを送る（SSE stream）
takawasi-cli chat "ToDoアプリを作って"

# インタラクティブ REPL
takawasi-cli chat

# JSON 一括返し
takawasi-cli exec "PythonでHello Worldを書いて"
```

**環境変数**

| 変数 | 説明 |
|---|---|
| `TAKAWASI_API_KEY` | API キー（なければ `~/.config/takawasi/session` を使用） |
| `TBA_ENGINE_URL` | TBA エンジン URL（デフォルト: `https://engine.takawasi-social.com`） |

---

## ビルド手順 / Build

```bash
# 依存インストール（node-pty を electron に合わせてリビルド）
npm install

# 開発実行
npm run dev

# 配布バイナリ生成
npm run dist          # 全OS
npm run dist:mac      # mac のみ
npm run dist:win      # Windows のみ
npm run dist:linux    # Linux のみ
```

**前提**

- Node.js 18+
- Python 3（node-pty native build 用）
- macOS: Xcode Command Line Tools
- Windows: node-gyp / windows-build-tools

---

## 開発環境セットアップ / Development

```bash
git clone https://github.com/takawasi/takawasi-desktop.git
cd takawasi-desktop
npm install
npm run dev
```

**ディレクトリ構造**

```
src/
  main/index.ts      # Electron main process（IPC・セッション管理）
  preload/index.ts   # contextBridge 公開 API
  renderer/
    index.html       # メイン画面（4 panel + terminal）
    styles.css       # UI スタイル
    app.ts           # renderer ロジック（分割画面・TBA SSE・LaunchPad・端末）
  cli/index.ts       # takawasi-cli エントリポイント
assets/              # アプリアイコン等
electron-builder.yml # パッケージング設定
```

**技術選定の理由（自由判断 A-F）**

- **A. CLI 同梱**: `src/cli/` で同居。TS 共有、esbuild で単一 JS にバンドル。
- **B. バニラ TS**: portal 既存フロントと整合。React 不要な UI 複雑度。
- **C. electron-builder**: 実績豊富、yml 1ファイルで全 OS 設定完結。
- **D. 内蔵 BrowserWindow OAuth**: Google OAuth を Electron 内で完結。deep link 不要。
- **E. 自前 CSS Grid + マウスイベント**: 外部依存最小。4分割レイアウト程度なら十分。
- **F. portal/promo/ja/tba.html 手本**: ダーク UI + accent blue で既存デザイン踏襲。

---

## GitHub Releases への公開手順

1. GitHub に `takawasi/takawasi-desktop` public repo を作成
2. `git remote add origin https://github.com/takawasi/takawasi-desktop.git`
3. `git push -u origin main`
4. `npm run dist` でバイナリ生成（`release/` ディレクトリに出力）
5. GitHub Releases で tag `v0.1.0` を切り、各バイナリをアップロード

---

## ライセンス / License

MIT License — Copyright 2026 takawasi
