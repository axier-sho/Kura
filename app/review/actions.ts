"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth";

/**
 * Apply a human review to a document. Edits ARE the correction record
 * (spec §2: future training data). `intent=confirm` marks it confirmed.
 */
export async function reviewDocument(formData: FormData): Promise<void> {
  const { supabase, orgId } = await getSessionContext();
  if (!supabase || !orgId) return;

  const id = String(formData.get("doc_id") ?? "");
  if (!id) return;

  const intent = String(formData.get("intent") ?? "save");
  const title = String(formData.get("title") ?? "").trim();
  const docType = String(formData.get("doc_type") ?? "").trim();
  const collectionId = String(formData.get("collection_id") ?? "") || null;

  // Reconstruct extracted_fields from field__<key> inputs.
  const fields: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("field__")) {
      const fieldKey = key.slice("field__".length);
      const v = String(value).trim();
      if (fieldKey && v) fields[fieldKey] = v;
    }
  }

  await supabase
    .from("documents")
    .update({
      title: title || null,
      doc_type: docType || null,
      collection_id: collectionId,
      extracted_fields: fields,
      status: intent === "confirm" ? "confirmed" : "needs_review",
    })
    .eq("id", id)
    .eq("org_id", orgId);

  revalidatePath("/review");
  revalidatePath("/collections");
}
