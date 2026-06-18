/** Template reads/writes against the local SQLite database. */
import { getDb, newId, now } from "@/lib/db/sqlite";
import type { TemplateRow } from "@/lib/db/types";

export function listAll(): TemplateRow[] {
  return getDb()
    .prepare("SELECT * FROM templates ORDER BY created_at DESC")
    .all() as TemplateRow[];
}

export function getById(id: string): TemplateRow | undefined {
  return getDb()
    .prepare("SELECT * FROM templates WHERE id = ?")
    .get(id) as TemplateRow | undefined;
}

export function insert(
  name: string,
  docType: string | null,
  body: string,
): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO templates (id, name, doc_type, body, version, created_at) VALUES (?, ?, ?, ?, 1, ?)",
    )
    .run(id, name, docType, body, now());
  return id;
}
