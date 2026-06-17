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

  // Reconstruct extracted_fields from field__<key> inputs. The form carries the
  // original value type in fieldtype__<key> so numeric fields stay numbers
  // (the column is Record<string, string | number | null>); coercing everything
  // to string would corrupt the documented correction record.
  const fieldTypes: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("fieldtype__")) {
      fieldTypes[key.slice("fieldtype__".length)] = String(value);
    }
  }
  const fields: Record<string, string | number | null> = {};
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("field__")) continue;
    const fieldKey = key.slice("field__".length);
    if (!fieldKey) continue;
    const v = String(value).trim();
    if (v === "") {
      // A blanked field is preserved as null (an edit/correction) rather than
      // silently dropped from the record.
      fields[fieldKey] = null;
    } else if (fieldTypes[fieldKey] === "number") {
      const n = Number(v);
      fields[fieldKey] = Number.isFinite(n) ? n : v;
    } else {
      fields[fieldKey] = v;
    }
  }

  const { error } = await supabase
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

  if (error) {
    throw new Error(`書類の更新に失敗しました: ${error.message}`);
  }

  revalidatePath("/review");
  revalidatePath("/collections");
}
