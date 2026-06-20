/**
 * Plain constants for organize mode, kept dependency-free so modules that only
 * need these names (e.g. lib/workspace/fs.ts) don't transitively import the
 * SQLite-backed settings repository (and the native better-sqlite3 binding with
 * it). lib/workspace/settings.ts re-exports these for back-compat.
 */

/** Settings-table key holding the user-chosen working directory path. */
export const WORKING_DIR_KEY = "working_dir";

/** Name of the inbox subfolder where files to be organized are dropped. */
export const INBOX_NAME = "_inbox";
