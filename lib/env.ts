/**
 * Centralized environment access + feature gating.
 *
 * Kura is local-first: all data lives on disk (see lib/paths.ts), so the app
 * runs fully offline. The ONLY thing that uses the internet is the Gemini AI
 * pipeline — and even that degrades gracefully when GEMINI_API_KEY is unset
 * (the pipeline returns clearly-labeled stubs).
 */

/**
 * Parse the embedding dimension. A non-numeric override (e.g. "768px") would
 * become NaN and serialize to null in the embedding request, silently producing
 * a wrong-length vector that breaks similarity search; fall back to 768 instead.
 */
function parseEmbeddingDim(raw: string | undefined): number {
  const n = Number(raw ?? "768");
  if (!Number.isInteger(n) || n <= 0) {
    if (raw !== undefined) {
      console.warn(
        `[kura] GEMINI_EMBEDDING_DIM="${raw}" は不正です。768 を使用します。`,
      );
    }
    return 768;
  }
  return n;
}

export const env = {
  // Gemini (the one feature that reaches the internet)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiModelEscalation: process.env.GEMINI_MODEL_ESCALATION ?? "gemini-2.5-pro",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  geminiEmbeddingDim: parseEmbeddingDim(process.env.GEMINI_EMBEDDING_DIM),

  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};
