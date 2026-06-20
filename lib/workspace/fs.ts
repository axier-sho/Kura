/**
 * Sandboxed filesystem operations for organize mode. All paths are validated
 * against the working directory via assertInside before any read/write/move.
 */
import fs from "node:fs";
import path from "node:path";
import { assertInside } from "@/lib/workspace/paths";
import { INBOX_NAME } from "@/lib/workspace/constants";

export interface WorkspaceListing {
  workingDir: string;
  inboxPath: string;
  /** Absolute paths of top-level files in the inbox (non-recursive). */
  inboxFiles: string[];
  /** Top-level subfolder names, excluding the inbox and dot-folders. */
  categories: string[];
}

/**
 * Strip path separators and OS-illegal characters from a folder name. Spaces
 * and hyphens are preserved; control characters are removed by code point.
 */
export function sanitizeFolderName(name: string): string {
  const cleaned = Array.from(name.replace(/[\\/]/g, " "))
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      if (code < 0x20) return false; // control characters
      return !['<', '>', ':', '"', '|', '?', '*'].includes(ch);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned || cleaned === "." || cleaned === "..") {
    throw new Error("フォルダ名が不正です。");
  }
  return cleaned;
}

/**
 * List the working directory: ensure the inbox exists, return inbox files and
 * the category subfolders. Inbox files and categories are top-level only
 * (non-recursive); dot-entries are ignored.
 */
export function listWorkspace(workingDir: string): WorkspaceListing {
  const inboxPath = path.join(workingDir, INBOX_NAME);
  fs.mkdirSync(inboxPath, { recursive: true });

  const entries = fs.readdirSync(workingDir, { withFileTypes: true });
  const categories = entries
    .filter(
      (e) =>
        e.isDirectory() && e.name !== INBOX_NAME && !e.name.startsWith("."),
    )
    .map((e) => e.name)
    .sort((a, b) => a.localeCompare(b, "ja"));

  const inboxFiles = fs
    .readdirSync(inboxPath, { withFileTypes: true })
    .filter((e) => e.isFile() && !e.name.startsWith("."))
    .map((e) => path.join(inboxPath, e.name));

  return { workingDir, inboxPath, inboxFiles, categories };
}

/** Pick a non-colliding destination path, inserting " (2)", " (3)", … */
export function uniqueDestPath(targetDir: string, filename: string): string {
  const safe = path.basename(filename).replace(/[\\/]/g, "_");
  const parsed = path.parse(safe);
  let candidate = path.join(targetDir, safe);
  let n = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(targetDir, `${parsed.name} (${n})${parsed.ext}`);
    n++;
  }
  return candidate;
}

/**
 * Move a file into a destination directory (both must be inside workingDir).
 * Uses rename, falling back to copy+unlink across filesystems (EXDEV).
 * Returns the new absolute path.
 */
export function moveFile(
  workingDir: string,
  srcAbs: string,
  destDirAbs: string,
  filename: string,
): string {
  assertInside(workingDir, srcAbs);
  assertInside(workingDir, destDirAbs);
  fs.mkdirSync(destDirAbs, { recursive: true });
  const dest = uniqueDestPath(destDirAbs, filename);
  assertInside(workingDir, dest);
  try {
    fs.renameSync(srcAbs, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "EXDEV") {
      fs.copyFileSync(srcAbs, dest);
      fs.unlinkSync(srcAbs);
    } else {
      throw err;
    }
  }
  return dest;
}

/** Create (if needed) a category subfolder under the working dir; return its path. */
export function createCategoryFolder(workingDir: string, name: string): string {
  const safe = sanitizeFolderName(name);
  const dir = assertInside(workingDir, safe);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
