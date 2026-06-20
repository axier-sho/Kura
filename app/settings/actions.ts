"use server";

import { revalidatePath } from "next/cache";
import { encryptSecret } from "@/lib/crypto";
import { SETTINGS_KEYS } from "@/lib/ai/config";
import * as settingsRepo from "@/lib/db/repositories/settings";

/** Trim a submitted model id; empty → null so resolution falls back to the env default. */
function normalizeModel(raw: FormDataEntryValue | null): string | null {
  const s = String(raw ?? "").trim();
  return s || null;
}

/** Trim + cap a free-text field; empty → null. Caps prompt bloat / token cost. */
function normalizeText(raw: FormDataEntryValue | null, max: number): string | null {
  const s = String(raw ?? "")
    .trim()
    .slice(0, max);
  return s || null;
}

/**
 * Save the AI settings. The API key is (re)written only when a non-empty value
 * is submitted — leaving the field blank keeps the existing stored key (the
 * form shows it as 設定済み). The key is encrypted before storage and is never
 * read back to the client.
 */
export async function updateAiSettings(formData: FormData): Promise<void> {
  settingsRepo.set(SETTINGS_KEYS.model, normalizeModel(formData.get("model")));
  settingsRepo.set(
    SETTINGS_KEYS.modelEscalation,
    normalizeModel(formData.get("model_escalation")),
  );
  settingsRepo.set(
    SETTINGS_KEYS.occupation,
    normalizeText(formData.get("occupation"), 200),
  );
  settingsRepo.set(
    SETTINGS_KEYS.customInstruction,
    normalizeText(formData.get("custom_instruction"), 2000),
  );

  const apiKey = String(formData.get("api_key") ?? "").trim();
  if (apiKey) settingsRepo.set(SETTINGS_KEYS.apiKey, encryptSecret(apiKey));

  revalidatePath("/settings");
}

/** Remove the stored API key (AI reverts to stubs until a new key is set). */
export async function clearApiKey(): Promise<void> {
  settingsRepo.set(SETTINGS_KEYS.apiKey, null);
  revalidatePath("/settings");
}
