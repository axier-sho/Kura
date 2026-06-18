/**
 * Per-user AI configuration (BYOK).
 *
 * Kura ships no shared key, so the API key comes from the user's own
 * user_ai_settings row first; env.geminiApiKey is only a self-host/dev fallback
 * (normally empty). Model choices fall back to env defaults. Embeddings stay
 * env-fixed (model + dim) to preserve the vector(768) column.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";

/** Curated Gemini models offered in the settings dropdown; the form also accepts a custom id. */
export const GEMINI_MODELS = [
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
] as const;

/** Resolved, ready-to-use AI config for a single request. */
export interface AiConfig {
  apiKey: string;
  model: string;
  modelEscalation: string;
  /** True when a usable API key was resolved (user's, else env fallback). */
  configured: boolean;
}

interface UserAiSettingsRow {
  gemini_api_key: string | null;
  gemini_model: string | null;
  gemini_model_escalation: string | null;
}

/**
 * Resolve the effective AI config for a user: their own row over env defaults.
 * Reads through the caller's RLS-scoped client (a user sees only their own row).
 */
export async function getAiConfigForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<AiConfig> {
  const { data } = await supabase
    .from("user_ai_settings")
    .select("gemini_api_key, gemini_model, gemini_model_escalation")
    .eq("user_id", userId)
    .maybeSingle();
  const row = (data as UserAiSettingsRow | null) ?? null;

  let apiKey = env.geminiApiKey;
  if (row?.gemini_api_key) {
    try {
      apiKey = decryptSecret(row.gemini_api_key);
    } catch (err) {
      // Can't recover the user's key (e.g. KURA_ENCRYPTION_KEY changed): keep
      // the env fallback rather than crashing ingestion.
      console.error("[kura] API キーの復号に失敗しました(環境変数にフォールバック):", err);
    }
  }

  const model = row?.gemini_model || env.geminiModel || GEMINI_MODELS[0];
  const modelEscalation = row?.gemini_model_escalation || env.geminiModelEscalation || model;

  return { apiKey, model, modelEscalation, configured: Boolean(apiKey) };
}
