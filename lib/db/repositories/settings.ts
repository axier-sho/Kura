/** Key/value settings stored in the local SQLite database. */
import { getDb, now } from "@/lib/db/sqlite";

export function get(key: string): string | null {
  const row = getDb()
    .prepare("SELECT value FROM settings WHERE key = ?")
    .get(key) as { value: string | null } | undefined;
  return row ? row.value : null;
}

export function set(key: string, value: string | null): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at)
         VALUES (@key, @value, @updated_at)
       ON CONFLICT(key) DO UPDATE SET value = @value, updated_at = @updated_at`,
    )
    .run({ key, value, updated_at: now() });
}
