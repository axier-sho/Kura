/**
 * At-rest encryption for user secrets (the BYOK Gemini API key).
 *
 * AES-256-GCM. The key is resolved in this order:
 *   1. KURA_ENCRYPTION_KEY env var (self-host / web; any string, hashed to 32B).
 *   2. A random 32-byte key persisted under the app-data dir (`enc.key`),
 *      generated on first use. This is what the packaged desktop app uses — the
 *      Tauri sidecar never sets the env var, so without this fallback the key
 *      would be stored in plaintext. Keeping the key in a separate 0600 file
 *      (not the DB) means the API key is no longer sitting in plaintext inside a
 *      database file that may be backed up, synced, or shared for support.
 * Only when neither is available (env unset AND the key file cannot be created)
 * is the secret stored as plaintext, with a one-time warning.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { dataDir } from "@/lib/paths";

const PREFIX = "enc:v1:";
const KEY_FILE = path.join(dataDir, "enc.key");

// Resolve the key once per process. `undefined` = not yet resolved; `null` =
// resolved to "no key available" (plaintext mode).
let cachedKey: Buffer | null | undefined;

/** Read the persisted local key, creating it (0600) on first use. */
function loadOrCreateLocalKey(): Buffer | null {
  try {
    const existing = fs.readFileSync(KEY_FILE);
    if (existing.length === 32) return existing;
  } catch {
    // Missing/unreadable — fall through and try to create it.
  }
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const key = randomBytes(32);
    fs.writeFileSync(KEY_FILE, key, { mode: 0o600 });
    return key;
  } catch {
    return null;
  }
}

/** Derive the 32-byte AES key (env override, else the persisted local key). */
function deriveKey(): Buffer | null {
  if (cachedKey !== undefined) return cachedKey;
  const secret = process.env.KURA_ENCRYPTION_KEY ?? "";
  cachedKey = secret
    ? createHash("sha256").update(secret).digest()
    : loadOrCreateLocalKey();
  return cachedKey;
}

let warned = false;
function warnPlaintextOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[kura] 暗号鍵を利用できません。API キーを暗号化せず平文で保存します。",
  );
}

/** Encrypt a secret for storage. Returns unprefixed plaintext when no key is set. */
export function encryptSecret(plain: string): string {
  const key = deriveKey();
  if (!key) {
    warnPlaintextOnce();
    return plain;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":")
  );
}

/**
 * Decrypt a value produced by encryptSecret. Values without the prefix are
 * returned as-is (written while no key was configured). Throws if a value was
 * encrypted but the key is now missing/changed.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const key = deriveKey();
  if (!key) {
    throw new Error("KURA_ENCRYPTION_KEY が未設定のため API キーを復号できません。");
  }
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3 || parts.some((p) => !p)) {
    // Corrupt/truncated ciphertext: fail with a clear, catchable message instead
    // of an opaque TypeError from Buffer.from(undefined, ...) downstream.
    throw new Error("暗号化された API キーの形式が不正です。");
  }
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
