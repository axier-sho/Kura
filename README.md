# 蔵 Kura 書類整理AI

*[English README](./README.en.md)*

![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)
![Google Gemini](https://img.shields.io/badge/google%20gemini-8E75B2?style=for-the-badge&logo=google%20gemini&logoColor=white)
![Tauri](https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)

ファイルを取り込み、AI(Google Gemini)が「何の書類か」を判定して必要な情報を抽出し、
コレクションごとに整理して、あとから**構造化検索 + 意味検索**で探せるようにするツールです。
抽出した日付(更新日・引き渡し日・支払期日など)は自動でカレンダー化し、
テンプレートから書類ドラフト(.docx)も生成します。

> **ローカルファースト**: データ(SQLite データベースと元ファイル)はすべて端末内に保存され、
> オンラインDBやアカウントは不要です。インターネットに接続するのは **AI機能(Gemini)のときだけ**。

> 不動産業は一例です。Kura は**汎用の書類整理ツール**として、契約書・請求書・領収書・
> 申込書・各種通知など種類を限定せずに扱えます。

## 主な機能

1. **取り込み** ドラッグ&ドロップ、または(デスクトップ版)**フォルダ自動監視**
   - **整理モード(ワーキングディレクトリ)**: 1つの親フォルダ内だけで作業。`_inbox` に入れたファイルを
     AIが**既存サブフォルダをスキャンして自動振り分け**(高確信は移動、低確信は確認待ちに保留)。既存に合うものが無ければ新規フォルダも作成。
2. **分類 + 抽出** Gemini が種別・項目・キーワード・期日イベント・確信度を1回のJSONで出力
3. **テキスト先行 / Vision フォールバック** DOCX・テキスト層PDFは直接抽出、画像・スキャンは Vision
4. **解像度/モデルのエスカレーション** 低確信度のときだけ上位モデル(`gemini-2.5-pro`)で再試行
5. **人の確認(ヒューマンインザループ)** AIの整理案を確認・修正してから確定。修正は正解データに
6. **整理** 「コレクション → 種別 → ファイル」階層 + 構造化フィルタ
7. **検索** 構造化(種別・コレクション・日付)+ 埋め込みの意味検索(端末内でコサイン類似度を計算)
8. **期日カレンダー** 抽出した期日を自動カレンダー化し、ダッシュボードに直近の期日を表示
9. **ドラフト生成** テンプレート + 抽出項目から .docx を生成(確定は人が行う)
10. **ローカル保存** SQLite + ローカルファイルに保存。サーバー・アカウント不要

## 技術スタック

- **Next.js 16(App Router)/ TypeScript / Tailwind CSS**
- **SQLite**(`better-sqlite3`)+ ローカルファイルストレージ ― データはすべて端末内
- **Google Gemini API**(`@google/genai`) 分類・抽出(マルチモーダル)・埋め込み(唯一のオンライン機能)
- **Tauri 2**(Windows デスクトップ版 + フォルダ自動監視)
- **docx**(ドラフト生成)

> 環境変数が未設定でもビルド・起動します。AI機能は `GEMINI_API_KEY` を設定すると有効化されます。

## セットアップ

### 1. 依存関係

```bash
npm install
```

### 2. 環境変数

```bash
cp .env.example .env.local
```

`.env.local` を編集:

- **Gemini**(推奨): 自分のキーをアプリ内の **設定 / Settings** で登録します
  (https://aistudio.google.com/apikey)。キーは暗号化して保存されます。`.env.local` の
  `GEMINI_API_KEY` は自己ホスト用の任意フォールバックです。未設定でも動作します
  (AIは「未設定」のスタブ結果を返します)。
- **暗号化キー**(本番では推奨): `KURA_ENCRYPTION_KEY`。保存する Gemini キーを暗号化
  します。未設定時は平文保存(警告ログ)。
- **データ保存先**(任意): `KURA_DATA_DIR`。未設定時はOSのユーザーデータ領域を使用
  (例: `~/.local/share/kura`、`%APPDATA%\kura`、`~/Library/Application Support/kura`)。

### 3. データベース

セットアップ不要です。初回起動時に、データ保存先へ SQLite データベース(`kura.db`)と
元ファイル用の `files/` フォルダが自動作成されます。

> 埋め込み次元はデフォルト **768**(`GEMINI_EMBEDDING_DIM`)。意味検索は端末内で
> コサイン類似度を計算します(外部のベクトルDBは不要)。

### 4. 起動(Web)

```bash
npm run dev      # 開発
npm run build && npm run start   # 本番
```

`http://localhost:3000` を開き、「取り込み」からファイルを投入します(ログイン不要)。

### 整理モード(ワーキングディレクトリで実フォルダ振り分け)

「整理」画面で**ワーキングディレクトリ(親フォルダ)**を1つ指定します。アプリはその中だけで作業し
(サンドボックス:外部パスへの読み書きは拒否)、直下に受信箱 `_inbox` を自動作成します。

1. 整理したいファイルを `_inbox` に入れる(デスクトップ版は「フォルダを選択」、Web版はパスを入力)。
2. 「整理する」を押すと、各ファイルをパイプラインにかけ、AIが**既存サブフォルダをスキャン**して最適な
   振り分け先を判断します。
3. **確信度が高ければ実ファイルをそのサブフォルダへ移動**(`storage_path` も更新)。既存に合うものが無ければ
   AIが新しいフォルダを作成して入れます。**確信度が低い/該当なしのものは `_inbox` に保留**し、確認待ち(`/review`)で人が確定します。

> 各サブフォルダは同名のコレクションに同期され、検索・カレンダー・ドラフト生成など既存機能から扱えます。
> `GEMINI_API_KEY` 未設定時は安全側に倒し、すべて受信箱に保留します(移動しません)。

## Windows デスクトップ版(Tauri)

Web 版に加え、Windows ネイティブアプリとして動作し、**指定フォルダを監視して自動取り込み**
できます(ブラウザ単体では不可能なローカルフォルダ監視を実現)。デスクトップ版は同じ
Next.js の画面を表示し、フォルダ監視で見つけたファイルを同じ取り込みAPIへ送ります。

### 開発実行

```bash
# Next.js を起動しておく(tauri:dev が beforeDevCommand で自動起動もします)
npm run tauri:dev
```

### Windows インストーラのビルド

ビルドには Rust と OS 固有の依存(Windows 推奨)が必要です。**Windows 上**で:

```bash
npm run tauri icon path/to/icon.png   # 初回のみ:アイコン生成(src-tauri/icons/ へ)
npm run tauri:build                   # .exe(NSIS)/ MSI を生成
```

GitHub Actions(`.github/workflows/desktop-build.yml`、Windows ランナー)でも
ビルドできます(手動実行 or `v*` タグ push)。アイコン未コミット時はプレースホルダを自動生成します。

> 本リポジトリは Linux 環境でも Web 版のビルド・型チェック・Lint が通ることを確認済みです。
> Windows バイナリは上記の通り Windows もしくは CI で生成します。
> 監視対象アプリのURLは `src-tauri/tauri.conf.json` と `src-tauri/dist/index.html` で変更できます。

## 処理パイプライン

```
入力(PDF/PNG/DOCX/TXT)
  → テキスト抽出(DOCX:mammoth / PDF:unpdf)or Vision(画像・スキャン)
  → Gemini で「分類 + 項目 + キーワード + 期日 + 確信度」を1回でJSON出力
  → (低確信度なら上位モデルで再試行)
  → 埋め込み生成(SQLite に保存し、検索時に端末内でコサイン類似度を計算)
  → 保存(content_hash でキャッシュ=索引)/ 期日イベント生成
  → 人が確認・確定
  → 検索・カレンダー・ドラフト生成
  → 生成書類を再アップロードすると再びパイプラインを通り、次の期日を生む(クローズドループ)
```

- **キャッシュ=索引**: 中身の SHA-256 + プロンプト版をキーに、再スキャンを回避(`lib/pipeline/persist.ts`)。
- **モデル/プロンプト版を記録**: 改善時に必要な分だけ再実行できます(`PROMPT_VERSION`)。

## ディレクトリ

```
app/                 Next.js ルート(ページ + API)
  api/documents      取り込みAPI(Web/デスクトップ共通)
  api/search         構造化 + 意味検索
  api/drafts         .docx ドラフト生成
  api/files/[id]     元ファイルをローカルから配信
components/          UI コンポーネント(desktop/ はTauri専用)
lib/
  pipeline/          抽出・分類・埋め込み・保存
  db/                SQLite 接続・スキーマ・リポジトリ層・ベクトル類似度
  storage/           元ファイルのローカル保存
  paths.ts           データ保存先(OSユーザーデータ領域)の解決
  gemini.ts          Gemini ラッパー(未設定なら無効化)
  drafts/            ドラフト生成
src-tauri/           Windows デスクトップ(Rust + フォルダ監視)
```

## ライセンス

Private.
