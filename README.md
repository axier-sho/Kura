# 蔵 Kura — 書類整理AI

ファイルを取り込み、AI(Google Gemini)が「何の書類か」を判定して必要な情報を抽出し、
コレクションごとに整理して、あとから**構造化検索 + 意味検索**で探せるようにするツールです。
抽出した日付(更新日・引き渡し日・支払期日など)は自動でカレンダー化して事前通知し、
テンプレートから書類ドラフト(.docx)も生成します。

> 不動産業は一例です。Kura は**汎用の書類整理ツール**として、契約書・請求書・領収書・
> 申込書・各種通知など種類を限定せずに扱えます。

## 主な機能

1. **取り込み** — ドラッグ&ドロップ、または(デスクトップ版)**フォルダ自動監視**
2. **分類 + 抽出** — Gemini が種別・項目・キーワード・期日イベント・確信度を1回のJSONで出力
3. **テキスト先行 / Vision フォールバック** — DOCX・テキスト層PDFは直接抽出、画像・スキャンは Vision
4. **解像度/モデルのエスカレーション** — 低確信度のときだけ上位モデル(`gemini-2.5-pro`)で再試行
5. **人の確認(ヒューマンインザループ)** — AIの整理案を確認・修正してから確定。修正は正解データに
6. **整理** — 「コレクション → 種別 → ファイル」階層 + 構造化フィルタ
7. **検索** — 構造化(種別・コレクション・日付)+ pgvector による意味検索
8. **期日カレンダー・通知** — 抽出した期日を自動カレンダー化し、cron + メールで事前通知
9. **ドラフト生成** — テンプレート + 抽出項目から .docx を生成(確定は人が行う)
10. **マルチテナント** — 全テーブルに `org_id` + RLS。将来のSaaS化に対応

## 技術スタック

- **Next.js 16(App Router)/ TypeScript / Tailwind CSS**
- **Supabase**(Postgres + pgvector + RLS + Auth + Storage)
- **Google Gemini API**(`@google/genai`)— 分類・抽出(マルチモーダル)・埋め込み
- **Tauri 2**(Windows デスクトップ版 + フォルダ自動監視)
- **docx**(ドラフト生成)/ **Resend**(メール通知)/ **Vercel Cron**(定期通知)

> 環境変数が未設定でもビルド・起動します。AI/DB機能はキーを設定すると有効化されます。

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

- **Supabase**: `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
  `SUPABASE_SERVICE_ROLE_KEY`(Settings → API)
- **Gemini**: `GEMINI_API_KEY`(https://aistudio.google.com/apikey)
- **通知**(任意): `RESEND_API_KEY` / `NOTIFY_FROM_EMAIL`
- **Cron**: `CRON_SECRET`(任意の秘密文字列)

### 3. データベース

Supabase プロジェクトの SQL Editor で `supabase/migrations/0001_init.sql` を実行します。
これでテーブル・RLS・pgvector・意味検索RPC(`match_documents`)・サインアップ時の組織
ブートストラップ・ストレージバケット(`kura-documents`)が作成されます。

> 埋め込み次元はデフォルト **768**(`GEMINI_EMBEDDING_DIM`)。SQL の `vector(768)` と
> 一致させてください。変更する場合は両方を合わせます。

### 4. 起動(Web)

```bash
npm run dev      # 開発
npm run build && npm run start   # 本番
```

`http://localhost:3000` を開き、新規登録 → ログイン → 「取り込み」からファイルを投入します。

## 期日通知(Cron)

毎日の通知は `/api/cron/notify` を叩きます(`Authorization: Bearer <CRON_SECRET>`)。
Vercel では `vercel.json` の cron 設定で自動実行されます(`CRON_SECRET` を環境変数に設定)。

手動テスト:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/notify
```

`RESEND_API_KEY` 未設定時は送信せずログ出力します。

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
  → 埋め込み生成(pgvector)
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
  api/cron/notify    期日通知 cron
  api/files/[id]     元ファイルの署名付きURLへリダイレクト
components/          UI コンポーネント(desktop/ はTauri専用)
lib/
  pipeline/          抽出・分類・埋め込み・保存
  supabase/          サーバー/ブラウザ/管理クライアント + 認証ミドルウェア
  gemini.ts          Gemini ラッパー(未設定なら無効化)
  drafts/, notify/   ドラフト生成、メール
supabase/migrations  スキーマ + RLS + pgvector + RPC
src-tauri/           Windows デスクトップ(Rust + フォルダ監視)
```

## ライセンス

Private.
