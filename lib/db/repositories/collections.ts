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
