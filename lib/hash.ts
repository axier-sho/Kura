import { createHash } from "node:crypto";

/**
 * SHA-256 of file content. This is the cache / dedupe key for documents
 * (spec §3: key on content, not filename, so renames and duplicates collapse).
 */
export function sha256(data: Uint8Array | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
