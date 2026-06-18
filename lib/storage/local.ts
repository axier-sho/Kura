/**
 * Local file storage for original uploaded documents. Replaces Supabase
 * Storage: files are written under the app-data `files/` directory, named by
 * content hash so re-uploads of identical content collapse onto one file.
 */
import fs from "node:fs";
import path from "node:path";
import { filesDir } from "@/lib/paths";

/** Strip directory separators so a filename can't escape `filesDir`. */
function safeName(filename: string): string {
  return path.basename(filename).replace(/[\\/]/g, "_");
}

/**
 * Persist the original bytes and return the absolute path used as the
 * document's `storage_path`.
 */
export function saveFile(
  hash: string,
  filename: string,
  bytes: Uint8Array,
): string {
  fs.mkdirSync(filesDir, { recursive: true });
  const dest = path.join(filesDir, `${hash}-${safeName(filename)}`);
  fs.writeFileSync(dest, bytes);
  return dest;
}

export function fileExists(storagePath: string): boolean {
  return fs.existsSync(storagePath);
}

export function readFile(storagePath: string): Buffer {
  return fs.readFileSync(storagePath);
}
