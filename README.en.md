# 蔵 Kura: Document-Organization AI

*[日本語版 README](./README.md)*

![Next JS](https://img.shields.io/badge/Next-black?style=for-the-badge&logo=next.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/typescript-%23007ACC.svg?style=for-the-badge&logo=typescript&logoColor=white)
![TailwindCSS](https://img.shields.io/badge/tailwindcss-%2338B2AC.svg?style=for-the-badge&logo=tailwind-css&logoColor=white)
![SQLite](https://img.shields.io/badge/sqlite-%2307405e.svg?style=for-the-badge&logo=sqlite&logoColor=white)
![Google Gemini](https://img.shields.io/badge/google%20gemini-8E75B2?style=for-the-badge&logo=google%20gemini&logoColor=white)
![Tauri](https://img.shields.io/badge/tauri-%2324C8DB.svg?style=for-the-badge&logo=tauri&logoColor=%23FFFFFF)
![Rust](https://img.shields.io/badge/rust-%23000000.svg?style=for-the-badge&logo=rust&logoColor=white)

Kura ingests your files, uses AI (Google Gemini) to determine "what kind of
document this is" and extract the relevant information, organizes them by
collection, and lets you find them later with **structured search + semantic
search**. Extracted dates (renewal dates, handover dates, payment due dates,
etc.) are automatically turned into a calendar, and it can also generate
document drafts (.docx) from templates.

> **Local-first**: all data (the SQLite database and original files) is stored
> on your machine — no online database and no accounts. The only time the app
> goes online is for the **AI feature (Gemini)**.

> Real estate is just one example. Kura is a **general-purpose
> document-organization tool**: it handles contracts, invoices, receipts,
> application forms, various notices, and more, without being limited to any
> specific type.

## Key Features

1. **Ingest** Drag & drop, or (desktop version) **automatic folder watching**
2. **Classify + Extract** Gemini outputs the type, fields, keywords, due-date events, and confidence in a single JSON pass
3. **Text-first / Vision fallback** DOCX and text-layer PDFs are extracted directly; images and scans use Vision
4. **Resolution/model escalation** Only when confidence is low, retry with a higher-tier model (`gemini-2.5-pro`)
5. **Human in the loop** Review and correct the AI's proposed organization before confirming; corrections become ground-truth data
6. **Organize** A "collection → type → file" hierarchy + structured filters
7. **Search** Structured (type, collection, date) + semantic search (cosine similarity computed on-device)
8. **Due-date calendar** Extracted due dates are automatically turned into a calendar, with upcoming dates surfaced on the dashboard
9. **Draft generation** Generate .docx from templates + extracted fields (a person makes the final call)
10. **Local storage** Saved to SQLite + local files. No server, no account

## Tech Stack

- **Next.js 16 (App Router) / TypeScript / Tailwind CSS**
- **SQLite** (`better-sqlite3`) + local file storage — all data stays on the machine
- **Google Gemini API** (`@google/genai`) classification, extraction (multimodal), and embeddings (the only online feature)
- **Tauri 2** (Windows desktop version + automatic folder watching)
- **docx** (draft generation)

> The app builds and runs even without environment variables set. The AI
> feature is enabled once you set `GEMINI_API_KEY`.

## Setup

### 1. Dependencies

```bash
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local`:

- **Gemini** (recommended): register your own key in-app under **Settings**
  (https://aistudio.google.com/apikey); it is stored encrypted on disk. The
  `.env.local` `GEMINI_API_KEY` is only an optional self-host fallback. Works
  without any key (the AI returns clearly-labeled "unset" stubs).
- **Encryption key** (recommended in production): `KURA_ENCRYPTION_KEY` encrypts
  the stored Gemini key at rest; unset means plaintext (a warning is logged).
- **Data location** (optional): `KURA_DATA_DIR`. Defaults to the OS per-user
  data directory (e.g. `~/.local/share/kura`, `%APPDATA%\kura`,
  `~/Library/Application Support/kura`).

### 3. Database

No setup required. On first run, a SQLite database (`kura.db`) and a `files/`
folder for originals are created automatically under the data directory.

> The embedding dimension defaults to **768** (`GEMINI_EMBEDDING_DIM`). Semantic
> search computes cosine similarity on-device (no external vector database).

### 4. Run (Web)

```bash
npm run dev      # development
npm run build && npm run start   # production
```

Open `http://localhost:3000` and submit files from "Ingest" (no login required).

## Windows Desktop Version (Tauri)

In addition to the web version, Kura runs as a native Windows app and can
**watch a designated folder and ingest files automatically** (achieving local
folder watching that a browser alone cannot). The desktop version displays the
same Next.js UI and sends files discovered by folder watching to the same
ingest API.

### Development

```bash
# Have Next.js running (tauri:dev also auto-starts it via beforeDevCommand)
npm run tauri:dev
```

### Building the Windows installer

Building requires Rust and the OS-specific dependencies (Windows recommended).
**On Windows**:

```bash
npm run tauri icon path/to/icon.png   # first time only: generate icons (into src-tauri/icons/)
npm run tauri:build                   # generate .exe (NSIS) / MSI
```

You can also build via GitHub Actions
(`.github/workflows/desktop-build.yml`, Windows runner) by manual dispatch or
pushing a `v*` tag. If icons are not committed, a placeholder is generated
automatically.

> This repository is verified to pass the web build, type check, and lint on
> Linux as well. Windows binaries are produced on Windows or in CI as described
> above. The watched app's URL can be changed in `src-tauri/tauri.conf.json`
> and `src-tauri/dist/index.html`.

## Processing Pipeline

```
Input (PDF/PNG/DOCX/TXT)
  → Text extraction (DOCX: mammoth / PDF: unpdf) or Vision (images, scans)
  → Gemini outputs "classification + fields + keywords + due dates + confidence" as JSON in one pass
  → (retry with a higher-tier model if confidence is low)
  → Embedding generation (stored in SQLite; cosine similarity computed on-device at search time)
  → Save (content_hash as cache = index) / generate due-date events
  → Human reviews and confirms
  → Search, calendar, draft generation
  → Re-uploading a generated document runs it through the pipeline again, producing the next due date (closed loop)
```

- **Cache = index**: keyed on the content's SHA-256 + prompt version to avoid
  re-scanning (`lib/pipeline/persist.ts`).
- **Records model/prompt version**: so you can re-run only what's needed when
  improving things (`PROMPT_VERSION`).

## Directory Layout

```
app/                 Next.js routes (pages + API)
  api/documents      Ingest API (shared by web/desktop)
  api/search         Structured + semantic search
  api/drafts         .docx draft generation
  api/files/[id]     Serve the original file from local storage
components/          UI components (desktop/ is Tauri-only)
lib/
  pipeline/          Extraction, classification, embeddings, persistence
  db/                SQLite connection, schema, repository layer, vector similarity
  storage/           Local storage of original files
  paths.ts           Resolves the data directory (OS per-user data dir)
  gemini.ts          Gemini wrapper (disabled when unconfigured)
  drafts/            Draft generation
src-tauri/           Windows desktop (Rust + folder watching)
```

## License

Licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).
