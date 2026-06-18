/**
 * Sandbox helpers: every filesystem operation in organize mode must resolve to
 * a path INSIDE the working directory. This prevents a crafted filename,
 * "..", or a symlinked subfolder from escaping the parent folder.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * Resolve the deepest existing ancestor of `p` through symlinks, then re-append
 * the not-yet-existing tail. Move targets may not exist yet, so we cannot
 * realpath the full path; resolving the existing prefix is enough to defeat a
 * symlinked directory that points outside the working dir.
 */
function realResolve(p: string): string {
  let current = path.resolve(p);
  const tail: string[] = [];
  // Walk up until we find a path that exists, collecting the missing segments.
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break; // reached the filesystem root
    tail.unshift(path.basename(current));
    current = parent;
  }
  let realBase: string;
  try {
    realBase = fs.realpathSync.native(current);
  } catch {
    realBase = current;
  }
  return tail.length ? path.join(realBase, ...tail) : realBase;
}

/** True when `child` is the same as, or nested inside, `parent`. */
export function isInside(parent: string, child: string): boolean {
  const p = realResolve(parent);
  const c = realResolve(child);
  if (c === p) return true;
  return c.startsWith(p + path.sep);
}

/**
 * Resolve `candidate` (relative to `workingDir` when not absolute) and assert it
 * stays inside `workingDir`. Returns the resolved absolute path, or throws.
 */
export function assertInside(workingDir: string, candidate: string): string {
  const resolved = path.isAbsolute(candidate)
    ? path.resolve(candidate)
    : path.resolve(workingDir, candidate);
  if (!isInside(workingDir, resolved)) {
    throw new Error("パスが作業フォルダの外です。");
  }
  return resolved;
}
