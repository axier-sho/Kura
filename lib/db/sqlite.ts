/**
 * Local SQLite database (better-sqlite3). Replaces the Supabase/PostgreSQL
 * backend with a single file under the app-data directory (see lib/paths.ts).
 *
 * The schema mirrors supabase/migrations/0001_init.sql, but with all
 * multi-tenancy removed: there is exactly one local workspace, so there are no
 * organizations/profiles/memberships tables and no org_id columns. Semantic
 * search is done in JS (lib/db/vector.ts) instead of pgvector, so embeddings
 * are stored as a JSON text column.
 */
import fs from "node:fs";
import Database from "better-sqlite3";
import { dataDir, dbPath } from "@/lib/paths";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS collections (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS documents (
  id                TEXT PRIMARY KEY,
  collection_id     TEXT REFERENCES collections(id) ON DELETE SET NULL,
  content_hash      TEXT NOT NULL,
  doc_type          TEXT,
  title             TEXT,
  extracted_fields  TEXT NOT NULL DEFAULT '{}',
  keywords          TEXT NOT NULL DEFAULT '[]',
  embedding         TEXT,
  confidence        REAL,
  model             TEXT,
  prompt_version    TEXT,
  status            TEXT NOT NULL DEFAULT 'needs_review',
  storage_path      TEXT,
  original_filename TEXT,
  mime_type         TEXT,
  is_stub           INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL,
  UNIQUE (content_hash, prompt_version)
);
CREATE INDEX IF NOT EXISTS documents_collection_idx ON documents(collection_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON documents(status);

CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY,
  document_id      TEXT REFERENCES documents(id) ON DELETE CASCADE,
  collection_id    TEXT REFERENCES collections(id) ON DELETE SET NULL,
  event_type       TEXT NOT NULL,
  due_date         TEXT,
  notify_lead_days INTEGER NOT NULL DEFAULT 14,
  action_needed    TEXT,
  status           TEXT NOT NULL DEFAULT 'open',
  notified_at      TEXT,
  generated_doc_id TEXT REFERENCES documents(id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS events_due_idx ON events(due_date);

CREATE TABLE IF NOT EXISTS templates (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  doc_type   TEXT,
  body       TEXT NOT NULL DEFAULT '',
  version    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS organize_runs (
  id          TEXT PRIMARY KEY,
  created_at  TEXT NOT NULL,
  working_dir TEXT NOT NULL,
  instruction TEXT,
  feedback    TEXT,
  processed   INTEGER NOT NULL,
  moved       INTEGER NOT NULL,
  held        INTEGER NOT NULL,
  errors      INTEGER NOT NULL,
  moves       TEXT NOT NULL DEFAULT '[]',
  undone      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS organize_runs_created_idx ON organize_runs(created_at);
`;

/**
 * Schema version of the CREATE TABLE shape above. The in-place auto-updater
 * (src-tauri) reuses the existing kura.db across releases, so a bare CREATE
 * TABLE IF NOT EXISTS never adds a new column to an already-created DB — the
 * first column change after a release would otherwise throw "no such column" on
 * every upgraded install. This versioned runner closes that gap.
 *
 * When the schema changes: append an idempotent step to MIGRATIONS (ALTER TABLE
 * etc.) AND update SCHEMA to the new shape so fresh installs get it directly.
 * MIGRATIONS[i] upgrades a DB at version (BASELINE_VERSION + i) to (i + 1).
 */
const BASELINE_VERSION = 1;
const MIGRATIONS: Array<(db: Database.Database) => void> = [];

function migrate(db: Database.Database): void {
  let version = db.pragma("user_version", { simple: true }) as number;
  if (version === 0) {
    // Either a brand-new DB (the base tables were just created) or a pre-
    // versioning DB that already carries the baseline columns. Either way it is
    // at the baseline; stamp it so future migrations have a starting point.
    version = BASELINE_VERSION;
    db.pragma(`user_version = ${BASELINE_VERSION}`);
  }
  for (let i = version - BASELINE_VERSION; i >= 0 && i < MIGRATIONS.length; i++) {
    db.transaction(() => MIGRATIONS[i](db))();
    db.pragma(`user_version = ${BASELINE_VERSION + i + 1}`);
  }
}

function open(): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

// Cache the connection across Next.js hot reloads in dev (module re-evaluation)
// so we don't leak file handles.
const globalForDb = globalThis as unknown as { __kuraDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__kuraDb) globalForDb.__kuraDb = open();
  return globalForDb.__kuraDb;
}

/**
 * Run a set of writes atomically: all commit, or none do. Nested calls (a
 * repository function that opens its own transaction) compose via SAVEPOINTs.
 */
export function transaction<T>(fn: () => T): T {
  return getDb().transaction(fn)();
}

/** Short opaque id for new rows (replaces Postgres gen_random_uuid()). */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO timestamp used for created_at / updated_at (sorts lexicographically). */
export function now(): string {
  return new Date().toISOString();
}
