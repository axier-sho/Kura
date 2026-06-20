/** Collection reads/writes against the local SQLite database. */
import { getDb, newId, now } from "@/lib/db/sqlite";
import type { CollectionRow } from "@/lib/db/types";

export function count(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) AS n FROM collections")
    .get() as { n: number };
  return row.n;
}

export function listAll(): CollectionRow[] {
  return getDb()
    .prepare("SELECT * FROM collections ORDER BY created_at DESC")
    .all() as CollectionRow[];
}

export function listIdName(): Pick<CollectionRow, "id" | "name">[] {
  return getDb()
    .prepare("SELECT id, name FROM collections ORDER BY name")
    .all() as Pick<CollectionRow, "id" | "name">[];
}

export function getById(id: string): CollectionRow | undefined {
  return getDb()
    .prepare("SELECT * FROM collections WHERE id = ?")
    .get(id) as CollectionRow | undefined;
}

export function insert(name: string, description: string | null): string {
  const id = newId();
  getDb()
    .prepare(
      "INSERT INTO collections (id, name, description, created_at) VALUES (?, ?, ?, ?)",
    )
    .run(id, name, description, now());
  return id;
}

/** Rename / re-describe a collection. Returns whether a row was updated. */
export function rename(
  id: string,
  name: string,
  description: string | null,
): boolean {
  const info = getDb()
    .prepare("UPDATE collections SET name = ?, description = ? WHERE id = ?")
    .run(name, description, id);
  return info.changes > 0;
}

/**
 * Delete a collection. Documents/events that referenced it are not deleted —
 * their collection_id is reset to NULL (未分類) via the ON DELETE SET NULL
 * foreign keys (foreign_keys pragma is enabled in lib/db/sqlite.ts).
 */
export function remove(id: string): boolean {
  const info = getDb()
    .prepare("DELETE FROM collections WHERE id = ?")
    .run(id);
  return info.changes > 0;
}
