import { beforeAll, describe, expect, it } from "vitest";
import { encryptSecret, decryptSecret } from "@/lib/crypto";

// deriveKey() reads KURA_ENCRYPTION_KEY lazily (on first encrypt/decrypt), so
// setting it before any call makes the suite use a fixed env key and never touch
// the on-disk enc.key fallback.
beforeAll(() => {
  process.env.KURA_ENCRYPTION_KEY = "unit-test-encryption-key";
});

describe("encryptSecret / decryptSecret", () => {
  it("round-trips a secret through the enc:v1 envelope", () => {
    const secret = "AIzaSy-super-secret-api-key";
    const enc = encryptSecret(secret);
    expect(enc.startsWith("enc:v1:")).toBe(true);
    expect(enc).not.toContain(secret);
    expect(decryptSecret(enc)).toBe(secret);
  });

  it("round-trips unicode", () => {
    const secret = "鍵🔑キー";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  it("returns unprefixed values unchanged (written with no key configured)", () => {
    expect(decryptSecret("plaintext-key")).toBe("plaintext-key");
  });

  it("uses a fresh IV per call, so identical plaintext encrypts differently", () => {
    const a = encryptSecret("same");
    const b = encryptSecret("same");
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe("same");
    expect(decryptSecret(b)).toBe("same");
  });

  it("throws on a malformed (wrong-part-count) ciphertext", () => {
    expect(() => decryptSecret("enc:v1:onlyonepart")).toThrow();
    expect(() => decryptSecret("enc:v1:iv:tag")).toThrow();
    expect(() => decryptSecret("enc:v1:::")).toThrow();
  });

  it("throws when the ciphertext is tampered with (auth tag fails)", () => {
    const enc = encryptSecret("tamper-me");
    // Flip the last base64 char of the data segment.
    const flipped = enc.slice(0, -1) + (enc.endsWith("A") ? "B" : "A");
    expect(() => decryptSecret(flipped)).toThrow();
  });
});
