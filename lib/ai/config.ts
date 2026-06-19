/**
 * AI configuration (BYOK).
 *
 * Kura ships no shared key, so the API key comes from the local settings the
 * user registers in /settings first; env.geminiApiKey is only a self-host/dev
 * fallback (normally empty). Model choices fall back to env defaults. Embeddings
 * stay env-fixed (model + dim) so stored search vectors remain comparable.
 *
 * Single local workspace (offline-first): the config lives in the SQLite
 * key/value `settings` table, not a per-user row. The API key is encrypted at
 * rest by lib/crypto.ts when KURA_ENCRYPTION_KEY is set.
 */
import { env } from "@/lib/env";
import { decryptSecret } from "@/lib/crypto";
import * as settingsRepo from "@/lib/db/repositories/settings";

/** Settings-table keys for the BYOK config. */
export const SETTINGS_KEYS = {
  apiKey: "gemini_api_key",
  model: "gemini_model",
  modelEscalation: "gemini_model_escalation",
} as const;

/**
 * Curated Gemini models offered in the settings dropdown; the form also accepts
 * a custom id. Ordered newest/most-capable first. Kept current as of 2026-06:
 * gemini-2.0-flash was shut down (2026-06-01) and is dropped; the gemini-2.5
 * family is GA but scheduled for shutdown on 2026-10-16, so prefer gemini-3.x.
 */
export const GEMINI_MODELS = [
  "gemini-3.5-flash",
  "gemini-3.1-pro-preview",
  "gemini-3.1-flash-lite",
  "gemini-3-flash-preview",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
] as const;

/** Resolved, ready-to-use AI config for a single request. */
export interface AiConfig {
  apiKey: string;
  model: string;
  modelEscalation: string;
  /** True when a usable API key was resolved (stored key, else env fallback). */
  configured: boolean;
}

/**
 * Resolve the effective AI config: the stored key over the env default. A
 * decryption failure (e.g. KURA_ENCRYPTION_KEY changed) falls back to env
 * rather than crashing ingestion.
 */
export function getAiConfig(): AiConfig {
  const storedKey = settingsRepo.get(SETTINGS_KEYS.apiKey);
  let apiKey = env.geminiApiKey;
  if (storedKey) {
    try {
      apiKey = decryptSecret(storedKey);
    } catch (err) {
      console.error(
        "[kura] API キーの復号に失敗しました(環境変数にフォールバック):",
        err,
      );
    }
  }

  const model =
    settingsRepo.get(SETTINGS_KEYS.model) || env.geminiModel || GEMINI_MODELS[0];
  const modelEscalation =
    settingsRepo.get(SETTINGS_KEYS.modelEscalation) ||
    env.geminiModelEscalation ||
    model;

  return { apiKey, model, modelEscalation, configured: Boolean(apiKey) };
}

/** Whether a usable key is set, without exposing it (for stub gating in the UI). */
export function isAiConfigured(): boolean {
  return getAiConfig().configured;
}

/**
 * What the settings form needs to render. Never returns the key itself — only
 * whether one is stored (so the form can show 設定済み).
 */
export function getAiSettingsView(): {
  hasKey: boolean;
  model: string;
  modelEscalation: string;
} {
  return {
    hasKey: Boolean(settingsRepo.get(SETTINGS_KEYS.apiKey)),
    model: settingsRepo.get(SETTINGS_KEYS.model) ?? env.geminiModel,
    modelEscalation:
      settingsRepo.get(SETTINGS_KEYS.modelEscalation) ??
      env.geminiModelEscalation,
  };
}
