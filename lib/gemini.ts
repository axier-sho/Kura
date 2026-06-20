import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";

// One client per distinct API key — with BYOK, keys vary per user/request.
const clients = new Map<string, GoogleGenAI>();

/** Lazily construct a Gemini client for the given key. Returns null when empty. */
export function getGemini(apiKey: string): GoogleGenAI | null {
  if (!apiKey) return null;
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

export type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } };

/** Max attempts (1 initial + retries) before giving up on a transient failure. */
const MAX_ATTEMPTS = 3;
/** Base backoff in ms; doubled each retry, plus up to one base of jitter. */
const BACKOFF_BASE_MS = 400;

// Transient: a retry has a real chance of succeeding. Rate limits, 5xx, and
// network blips. Client errors (400/401/403/404) are NOT here — retrying a bad
// request or an invalid key just wastes time and quota.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);
const RETRYABLE_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNREFUSED",
  "EAI_AGAIN",
  "EPIPE",
]);

/** Heuristically decide whether a Gemini/network error is worth retrying. */
function isRetryable(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as {
    status?: number;
    code?: string;
    cause?: { code?: string };
    message?: string;
  };
  if (typeof e.status === "number" && RETRYABLE_STATUS.has(e.status)) return true;
  if (e.code && RETRYABLE_CODES.has(e.code)) return true;
  if (e.cause?.code && RETRYABLE_CODES.has(e.cause.code)) return true;
  // The SDK often surfaces only a message string (e.g. fetch failures, or an
  // HTTP status embedded in text). Match conservatively so a 400/401 never does.
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("fetch failed") || msg.includes("network error")) return true;
  if (
    /\b(429|500|502|503|504)\b/.test(msg) &&
    /(unavailable|overloaded|internal|exhausted|deadline|too many|rate)/.test(msg)
  ) {
    return true;
  }
  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retry a Gemini call on transient failures with exponential backoff + jitter.
 * Non-transient errors throw immediately. Transparent to callers — they keep
 * their existing try/catch fallbacks; this just makes those fire less often.
 */
async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt >= MAX_ATTEMPTS || !isRetryable(err)) break;
      const backoff =
        BACKOFF_BASE_MS * 2 ** (attempt - 1) + Math.random() * BACKOFF_BASE_MS;
      console.warn(
        `[kura] ${label} の一時的な失敗 (${attempt}/${MAX_ATTEMPTS})。${Math.round(
          backoff,
        )}ms 後に再試行します。`,
      );
      await sleep(backoff);
    }
  }
  throw lastErr;
}

/**
 * Single text/multimodal generation returning the raw text response.
 * Throws if no API key is given callers gate on AiConfig.configured.
 */
export async function generate(opts: {
  apiKey: string;
  model: string;
  systemInstruction?: string;
  parts: GeminiPart[];
  json?: boolean;
}): Promise<string> {
  const ai = getGemini(opts.apiKey);
  if (!ai) throw new Error("Gemini is not configured (API key missing)");

  const res = await withRetry(
    () =>
      ai.models.generateContent({
        model: opts.model,
        contents: [{ role: "user", parts: opts.parts }],
        config: {
          ...(opts.systemInstruction
            ? { systemInstruction: opts.systemInstruction }
            : {}),
          ...(opts.json ? { responseMimeType: "application/json" } : {}),
        },
      }),
    `generate(${opts.model})`,
  );

  return res.text ?? "";
}

/** Embed a single string with the given key. Returns null when no key is set. */
export async function embed(opts: {
  apiKey: string;
  text: string;
}): Promise<number[] | null> {
  const ai = getGemini(opts.apiKey);
  if (!ai) return null;

  const res = await withRetry(
    () =>
      ai.models.embedContent({
        model: env.geminiEmbeddingModel,
        contents: opts.text,
        config: { outputDimensionality: env.geminiEmbeddingDim },
      }),
    "embed",
  );

  const values = res.embeddings?.[0]?.values;
  return values ?? null;
}
