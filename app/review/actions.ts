"use server";

import path from "node:path";
import { revalidatePath } from "next/cache";
import * as documentsRepo from "@/lib/db/repositories/documents";
import * as collectionsRepo from "@/lib/db/repositories/collections";
import { getWorkingDir, INBOX_NAME } from "@/lib/workspace/settings";
import { moveFile, createCategoryFolder } from "@/lib/workspace/fs";

/**
 * Apply a human review to a document. Edits ARE the correction record
 * (spec §2: future training data). `intent=confirm` marks it confirmed.
 */
export async function reviewDocument(formData: FormData): Promise<void> {
  const id = String(formData.get("doc_id") ?? "");
  if (!id) return;

  const intent = String(formData.get("intent") ?? "save");
  const title = String(formData.get("title") ?? "").trim();
  const docType = String(formData.get("doc_type") ?? "").trim();
  // The collections UI was removed, so the form no longer carries a collection.
  // Preserve whatever collection_id the document already has — organize pre-fills
  // a held file's proposed folder here, so confirming it still files the file
  // into that folder below.
  const doc = documentsRepo.getById(id);
  const collectionId = doc?.collection_id ?? null;

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

  try {
    documentsRepo.updateReview(id, {
      title: title || null,
      docType: docType || null,
      collectionId,
      extractedFields: fields,
      status: intent === "confirm" ? "confirmed" : "needs_review",
    });
  } catch (err) {
    console.error("[kura] reviewDocument failed:", err);
    throw new Error("レビューの保存に失敗しました。");
  }

  // When confirming an organize-held file that still sits in the working-dir
  // inbox, physically move it into the chosen collection's folder and record the
  // new path — otherwise the DB says "filed in X" while the file never leaves
  // _inbox. Best-effort: a move failure leaves the file in the inbox (organize
  // now skips confirmed files, so it won't be re-processed or re-billed).
  if (intent === "confirm" && collectionId && doc?.storage_path) {
    try {
      const workingDir = getWorkingDir();
      const collection = collectionsRepo.getById(collectionId);
      if (workingDir && collection) {
        const inboxPrefix = path.join(workingDir, INBOX_NAME) + path.sep;
        if (doc.storage_path.startsWith(inboxPrefix)) {
          const destDir = createCategoryFolder(workingDir, collection.name);
          const newPath = moveFile(
            workingDir,
            doc.storage_path,
            destDir,
            path.basename(doc.storage_path),
          );
          documentsRepo.updateLocation(id, newPath, collectionId, "confirmed");
        }
      }
    } catch (err) {
      console.error("[kura] confirmed file move skipped:", err);
    }
  }

  revalidatePath("/review");
}
