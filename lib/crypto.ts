/**
 * At-rest encryption for user secrets (the BYOK Gemini API key).
 *
 * AES-256-GCM keyed by KURA_ENCRYPTION_KEY (any string; hashed to 32 bytes).
 * When the env key is absent the secret is stored as plaintext and a one-time
 * warning is logged so the app still runs with nothing configured (env-gating
 * ethos), while encryption is a single env var away in production.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

/** Derive a 32-byte key from KURA_ENCRYPTION_KEY, or null when unset. */
function deriveKey(): Buffer | null {
  const secret = process.env.KURA_ENCRYPTION_KEY ?? "";
  if (!secret) return null;
  return createHash("sha256").update(secret).digest();
}

let warned = false;
function warnPlaintextOnce(): void {
  if (warned) return;
  warned = true;
  console.warn(
    "[kura] KURA_ENCRYPTION_KEY が未設定です。API キーを暗号化せず平文で保存します。",
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
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(":");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const dec = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return dec.toString("utf8");
}
