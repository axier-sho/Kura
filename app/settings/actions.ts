"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";
import { encryptSecret } from "@/lib/crypto";

/** Trim a submitted model id; empty → null so resolution falls back to the env default. */
function normalizeModel(raw: FormDataEntryValue | null): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

/**
 * Save the user's AI settings. The API key is (re)written only when a non-empty
 * value is submitted leaving the field blank keeps the existing stored key
 * (the form shows it as 設定済み). The key is encrypted before storage and is
 * never read back to the client.
 */
export async function updateAiSettings(formData: FormData): Promise<void> {
  const { supabase, user } = await getSessionContext();
  if (!supabase || !user) {
    throw new Error("未認証です(ログインが必要です)。");
  }

  const update: Record<string, unknown> = {
    user_id: user.id,
    gemini_model: normalizeModel(formData.get("model")),
    gemini_model_escalation: normalizeModel(formData.get("model_escalation")),
    updated_at: new Date().toISOString(),
  };

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (apiKey) update.gemini_api_key = encryptSecret(apiKey);

  const { error } = await supabase
    .from("user_ai_settings")
    .upsert(update, { onConflict: "user_id" });
  if (error) {
    throw new Error(`AI 設定の保存に失敗しました: ${error.message}`);
  }

  revalidatePath("/settings");
}

/** Remove the stored API key (AI reverts to stubs until a new key is set). */
export async function clearApiKey(): Promise<void> {
  const { supabase, user } = await getSessionContext();
  if (!supabase || !user) {
    throw new Error("未認証です(ログインが必要です)。");
  }

  const { error } = await supabase
    .from("user_ai_settings")
    .upsert(
      { user_id: user.id, gemini_api_key: null, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) {
    throw new Error(`API キーの削除に失敗しました: ${error.message}`);
  }

  revalidatePath("/settings");
}
