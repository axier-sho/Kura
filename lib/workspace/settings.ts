/**
 * Working-directory settings for the filesystem-based "整理" (organize) mode.
 *
 * Unlike the default ingest flow (which copies files into the app-data
 * `filesDir`), organize mode operates directly inside ONE user-chosen parent
 * folder — the "working directory". The user drops files into a dedicated
 * inbox subfolder, and the AI routes them into sibling category subfolders.
 * The chosen path is user-selectable at runtime, so it lives in the DB
 * (settings table) rather than an environment variable.
 */
import fs from "node:fs";
import path from "node:path";
import * as settings from "@/lib/db/repositories/settings";
import { INBOX_NAME, WORKING_DIR_KEY } from "@/lib/workspace/constants";

// Re-export for back-compat: existing importers reference these from here.
export { INBOX_NAME, WORKING_DIR_KEY };

export function getWorkingDir(): string | null {
  return settings.get(WORKING_DIR_KEY);
}

/**
 * Validate and persist the working directory. Throws on a relative path or a
 * target that is not an existing directory.
 */
export function setWorkingDir(absPath: string): void {
  const trimmed = absPath.trim();
  if (!trimmed || !path.isAbsolute(trimmed)) {
    throw new Error("絶対パスを指定してください。");
  }
  const resolved = path.resolve(trimmed);
  let stat: fs.Stats;
  try {
    stat = fs.statSync(resolved);
  } catch {
    throw new Error("指定されたフォルダが存在しません。");
  }
  if (!stat.isDirectory()) {
    throw new Error("指定されたパスはフォルダではありません。");
  }
  settings.set(WORKING_DIR_KEY, resolved);
}
