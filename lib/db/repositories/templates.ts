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

export function update(
  id: string,
  name: string,
  docType: string | null,
  body: string,
): void {
  getDb()
    .prepare(
      "UPDATE templates SET name = ?, doc_type = ?, body = ?, version = version + 1 WHERE id = ?",
    )
    .run(name, docType, body, id);
}

export function deleteById(id: string): void {
  getDb().prepare("DELETE FROM templates WHERE id = ?").run(id);
}
