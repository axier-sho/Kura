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
`;

function open(): Database.Database {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// Cache the connection across Next.js hot reloads in dev (module re-evaluation)
// so we don't leak file handles.
const globalForDb = globalThis as unknown as { __kuraDb?: Database.Database };

export function getDb(): Database.Database {
  if (!globalForDb.__kuraDb) globalForDb.__kuraDb = open();
  return globalForDb.__kuraDb;
}

/** Short opaque id for new rows (replaces Postgres gen_random_uuid()). */
export function newId(): string {
  return crypto.randomUUID();
}

/** ISO timestamp used for created_at / updated_at (sorts lexicographically). */
export function now(): string {
  return new Date().toISOString();
}
