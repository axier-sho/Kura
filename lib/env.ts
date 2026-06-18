/**
 * Centralized environment access + feature gating.
 *
 * Kura is local-first: all data lives on disk (see lib/paths.ts), so the app
 * runs fully offline. The ONLY thing that uses the internet is the Gemini AI
 * pipeline — and even that degrades gracefully when GEMINI_API_KEY is unset
 * (the pipeline returns clearly-labeled stubs).
 */

export const env = {
  // Gemini (the one feature that reaches the internet)
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiModelEscalation: process.env.GEMINI_MODEL_ESCALATION ?? "gemini-2.5-pro",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  geminiEmbeddingDim: Number(process.env.GEMINI_EMBEDDING_DIM ?? "768"),

  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}
