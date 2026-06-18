/** Document reads/writes against the local SQLite database. */
import { getDb, newId, now } from "@/lib/db/sqlite";
import { cosine } from "@/lib/db/vector";
import type { DocumentRow } from "@/lib/db/types";

type RawDoc = {
  id: string;
  collection_id: string | null;
  content_hash: string;
  doc_type: string | null;
  title: string | null;
  extracted_fields: string;
  keywords: string;
  embedding: string | null;
  confidence: number | null;
  model: string | null;
  prompt_version: string | null;
  status: DocumentRow["status"];
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  is_stub: number;
  created_at: string;
  updated_at: string;
};

function mapDoc(r: RawDoc): DocumentRow {
  return {
    ...r,
    extracted_fields: JSON.parse(r.extracted_fields || "{}"),
    keywords: JSON.parse(r.keywords || "[]"),
    embedding: r.embedding ? (JSON.parse(r.embedding) as number[]) : null,
    is_stub: r.is_stub === 1,
  };
}

export function countByStatus(status: DocumentRow["status"]): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM documents WHERE status = ?")
    .get(status) as { n: number };
  return row.n;
}

export function listNeedsReview(): DocumentRow[] {
  const rows = getDb()
    .prepare(
      "SELECT * FROM documents WHERE status = 'needs_review' ORDER BY created_at DESC",
    )
    .all() as RawDoc[];
  return rows.map(mapDoc);
}

export function listConfirmedForDrafts(
  limit = 100,
): Pick<DocumentRow, "id" | "title" | "original_filename">[] {
  return getDb()
    .prepare(
      "SELECT id, title, original_filename FROM documents WHERE status = 'confirmed' ORDER BY created_at DESC LIMIT ?",
    )
    .all(limit) as Pick<DocumentRow, "id" | "title" | "original_filename">[];
}

export function getById(id: string): DocumentRow | undefined {
  const row = getDb()
    .prepare("SELECT * FROM documents WHERE id = ?")
    .get(id) as RawDoc | undefined;
  return row ? mapDoc(row) : undefined;
}

export interface CollectionFilter {
  type?: string;
  from?: string;
  to?: string;
}

export function listByCollection(
  collectionId: string,
  filter: CollectionFilter = {},
): DocumentRow[] {
  let sql = "SELECT * FROM documents WHERE collection_id = ?";
  const args: unknown[] = [collectionId];
  if (filter.type) {
    sql += " AND doc_type = ?";
    args.push(filter.type);
  }
  if (filter.from) {
    sql += " AND created_at >= ?";
    args.push(filter.from);
  }
  if (filter.to) {
    sql += " AND created_at <= ?";
    args.push(`${filter.to}T23:59:59`);
  }
  sql += " ORDER BY created_at DESC";
  return (getDb().prepare(sql).all(...args) as RawDoc[]).map(mapDoc);
}

export function listDocTypesByCollection(collectionId: string): string[] {
  const rows = getDb()
    .prepare(
      "SELECT DISTINCT doc_type FROM documents WHERE collection_id = ? AND doc_type IS NOT NULL",
    )
    .all(collectionId) as { doc_type: string }[];
  return rows.map((r) => r.doc_type);
}

/** The cache lookup: same content + same prompt version = reuse (spec §3). */
export function findCached(
  contentHash: string,
  promptVersion: string,
): { id: string } | undefined {
  return getDb()
    .prepare(
      "SELECT id FROM documents WHERE content_hash = ? AND prompt_version = ?",
    )
    .get(contentHash, promptVersion) as { id: string } | undefined;
}

export interface InsertDocumentInput {
  collectionId: string | null;
  contentHash: string;
  docType: string | null;
  title: string | null;
  extractedFields: Record<string, string | number | null>;
  keywords: string[];
  embedding: number[] | null;
  confidence: number | null;
  model: string | null;
  promptVersion: string | null;
  storagePath: string;
  originalFilename: string;
  mimeType: string;
  isStub: boolean;
}

export function insertDocument(input: InsertDocumentInput): string {
  const id = newId();
  const ts = now();
  getDb()
    .prepare(
      `INSERT INTO documents (
        id, collection_id, content_hash, doc_type, title, extracted_fields,
        keywords, embedding, confidence, model, prompt_version, status,
        storage_path, original_filename, mime_type, is_stub, created_at, updated_at
      ) VALUES (
        @id, @collection_id, @content_hash, @doc_type, @title, @extracted_fields,
        @keywords, @embedding, @confidence, @model, @prompt_version, 'needs_review',
        @storage_path, @original_filename, @mime_type, @is_stub, @created_at, @updated_at
      )`,
    )
    .run({
      id,
      collection_id: input.collectionId,
      content_hash: input.contentHash,
      doc_type: input.docType,
      title: input.title,
      extracted_fields: JSON.stringify(input.extractedFields ?? {}),
      keywords: JSON.stringify(input.keywords ?? []),
      embedding: input.embedding ? JSON.stringify(input.embedding) : null,
      confidence: input.confidence,
      model: input.model,
      prompt_version: input.promptVersion,
      storage_path: input.storagePath,
      original_filename: input.originalFilename,
      mime_type: input.mimeType,
      is_stub: input.isStub ? 1 : 0,
      created_at: ts,
      updated_at: ts,
    });
  return id;
}

export interface ReviewUpdate {
  title: string | null;
  docType: string | null;
  collectionId: string | null;
  extractedFields: Record<string, string>;
  status: "needs_review" | "confirmed";
}

export function updateReview(id: string, update: ReviewUpdate): void {
  getDb()
    .prepare(
      `UPDATE documents
         SET title = @title, doc_type = @doc_type, collection_id = @collection_id,
             extracted_fields = @extracted_fields, status = @status, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({
      id,
      title: update.title,
      doc_type: update.docType,
      collection_id: update.collectionId,
      extracted_fields: JSON.stringify(update.extractedFields),
      status: update.status,
      updated_at: now(),
    });
}

/**
 * Update a document's physical location, collection, and status. Used by
 * organize mode after a file is moved into a category subfolder (or left in
 * the inbox for review). Additive to the review flow; does not touch fields.
 */
export function updateLocation(
  id: string,
  storagePath: string,
  collectionId: string | null,
  status: DocumentRow["status"],
): void {
  getDb()
    .prepare(
      `UPDATE documents
         SET storage_path = @storage_path, collection_id = @collection_id,
             status = @status, updated_at = @updated_at
       WHERE id = @id`,
    )
    .run({
      id,
      storage_path: storagePath,
      collection_id: collectionId,
      status,
      updated_at: now(),
    });
}

/** Structured search: title / doc_type LIKE, optionally scoped to a collection. */
export function searchStructured(
  q: string,
  collectionId: string | null,
  limit = 50,
): string[] {
  let sql = "SELECT id FROM documents WHERE 1 = 1";
  const args: unknown[] = [];
  if (collectionId) {
    sql += " AND collection_id = ?";
    args.push(collectionId);
  }
  if (q) {
    sql += " AND (title LIKE ? OR doc_type LIKE ?)";
    const like = `%${q}%`;
    args.push(like, like);
  }
  sql += " LIMIT ?";
  args.push(limit);
  const rows = getDb().prepare(sql).all(...args) as { id: string }[];
  return rows.map((r) => r.id);
}

/** Semantic search: rank documents by cosine similarity to `vec` (spec §5). */
export function searchByEmbedding(
  vec: number[],
  collectionId: string | null,
  limit = 20,
): { id: string; similarity: number }[] {
  let sql =
    "SELECT id, embedding FROM documents WHERE embedding IS NOT NULL";
  const args: unknown[] = [];
  if (collectionId) {
    sql += " AND collection_id = ?";
    args.push(collectionId);
  }
  const rows = getDb().prepare(sql).all(...args) as {
    id: string;
    embedding: string;
  }[];
  return rows
    .map((r) => ({
      id: r.id,
      similarity: cosine(vec, JSON.parse(r.embedding) as number[]),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

export function getByIds(ids: string[]): DocumentRow[] {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = getDb()
    .prepare(`SELECT * FROM documents WHERE id IN (${placeholders})`)
    .all(...ids) as RawDoc[];
  return rows.map(mapDoc);
}
