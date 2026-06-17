/**
 * Centralized environment access + feature gating.
 *
 * The whole app is designed to build and run with NONE of these set. Each
 * subsystem checks its own `isXConfigured()` flag and degrades gracefully
 * (the AI pipeline returns clearly-labeled stubs, email is logged, etc.).
 */

/**
 * Parse the embedding dimension. A non-numeric override (e.g. "768px") would
 * become NaN and serialize to null in the API call, silently producing a
 * wrong-length vector that fails the pgvector column; fall back to 768 instead.
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
  // Supabase
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  storageBucket: process.env.SUPABASE_STORAGE_BUCKET ?? "kura-documents",

  // Gemini
  geminiApiKey: process.env.GEMINI_API_KEY ?? "",
  geminiModel: process.env.GEMINI_MODEL ?? "gemini-2.5-flash",
  geminiModelEscalation: process.env.GEMINI_MODEL_ESCALATION ?? "gemini-2.5-pro",
  geminiEmbeddingModel: process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-001",
  geminiEmbeddingDim: parseEmbeddingDim(process.env.GEMINI_EMBEDDING_DIM),

  // Email
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  notifyFromEmail: process.env.NOTIFY_FROM_EMAIL ?? "kura@example.com",

  // Cron
  cronSecret: process.env.CRON_SECRET ?? "",

  // App
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
};

export function isSupabaseConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function isSupabaseAdminConfigured(): boolean {
  return Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.geminiApiKey);
}

export function isEmailConfigured(): boolean {
  return Boolean(env.resendApiKey);
}
